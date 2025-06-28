declare module 'gradient-string' {
  interface Gradient {
    (text: string): string;
    multiline(text: string): string;
  }

  const gradient: {
    rainbow: Gradient;
    pastel: Gradient;
    cristal: Gradient;
    teen: Gradient;
    mind: Gradient;
    morning: Gradient;
    vice: Gradient;
    passion: Gradient;
    fruit: Gradient;
    instagram: Gradient;
    atlas: Gradient;
    retro: Gradient;
    summer: Gradient;
    (colors: string[]): Gradient;
  };

  export default gradient;
}