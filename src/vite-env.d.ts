declare module '*?raw' {
  const content: string;
  export default content;
}

interface Window {
  lastFrameLogTime?: number;
}
