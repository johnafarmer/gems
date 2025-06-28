import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

export interface Component {
  id?: number;
  name: string;
  type: string;
  description?: string;
  files: string;
  metadata: string;
  tags?: string[];
  created: Date;
  updated?: Date;
}

export interface ListOptions {
  type?: string;
  search?: string;
  limit?: number;
}

export class ComponentLibrary {
  private db: Database.Database;
  
  constructor() {
    const dataDir = join(homedir(), '.gems', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = join(dataDir, 'components.db');
    this.db = new Database(dbPath);
    this.initDatabase();
  }
  
  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        files TEXT NOT NULL,
        metadata TEXT NOT NULL,
        tags TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME
      )
    `);
  }
  
  async save(component: Omit<Component, 'id' | 'created'>): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO components (name, type, description, files, metadata, tags, updated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(
      component.name,
      component.type,
      component.description || null,
      component.files,
      component.metadata,
      component.tags ? component.tags.join(',') : null
    );
    
    return result.lastInsertRowid as number;
  }
  
  async get(name: string): Promise<Component | null> {
    const stmt = this.db.prepare('SELECT * FROM components WHERE name = ?');
    const row = stmt.get(name) as any;
    
    if (!row) return null;
    
    return {
      ...row,
      tags: row.tags ? row.tags.split(',') : [],
      created: new Date(row.created),
      updated: row.updated ? new Date(row.updated) : undefined
    };
  }
  
  async list(options: ListOptions = {}): Promise<Component[]> {
    let query = 'SELECT * FROM components WHERE 1=1';
    const params: any[] = [];
    
    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }
    
    if (options.search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${options.search}%`, `%${options.search}%`);
    }
    
    query += ' ORDER BY created DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      ...row,
      tags: row.tags ? row.tags.split(',') : [],
      created: new Date(row.created),
      updated: row.updated ? new Date(row.updated) : undefined
    }));
  }
  
  async delete(name: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM components WHERE name = ?');
    const result = stmt.run(name);
    return result.changes > 0;
  }
  
  close(): void {
    this.db.close();
  }
}