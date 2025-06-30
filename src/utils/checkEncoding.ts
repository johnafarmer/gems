export function checkEncodingSupport(): void {
  const testEmoji = '✨';
  const buffer = Buffer.from(testEmoji);
  const decoded = buffer.toString('utf8');
  
  if (decoded !== testEmoji) {
    console.warn('⚠️  Warning: Unicode encoding issue detected');
    console.warn(`Expected: ${testEmoji} but got: ${decoded}`);
    console.warn('This may cause display issues with emojis and special characters');
    console.warn('Try running GEMS in a different terminal or check your locale settings');
  }
}