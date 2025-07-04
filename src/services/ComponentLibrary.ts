import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

// Type definitions for better cross-runtime support
interface DatabaseInterface {
  prepare(sql: string): any;
  exec(sql: string): void;
  close(): void;
}

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
  private db: DatabaseInterface;
  
  constructor() {
    const dataDir = join(homedir(), '.gems', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = join(dataDir, 'components.db');
    
    // Use Bun's built-in SQLite when available, otherwise fall back to better-sqlite3
    if (typeof Bun !== 'undefined') {
      // Running under Bun - use built-in SQLite
      const { Database } = require('bun:sqlite');
      this.db = new Database(dbPath) as DatabaseInterface;
    } else {
      // Running under Node.js - use better-sqlite3
      const Database = require('better-sqlite3');
      this.db = new Database(dbPath) as DatabaseInterface;
    }
    
    this.initDatabase();
  }
  
  private initDatabase(): void {
    const sql = `
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
    `;
    
    if (typeof Bun !== 'undefined') {
      // Bun uses run() instead of exec()
      (this.db as any).run(sql);
    } else {
      this.db.exec(sql);
    }
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
    
    let rows: any[];
    if (typeof Bun !== 'undefined') {
      // Bun uses query() instead of prepare().all()
      const dbQuery = (this.db as any).query(query);
      rows = dbQuery.all(...params);
    } else {
      const stmt = this.db.prepare(query);
      rows = stmt.all(...params) as any[];
    }
    
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