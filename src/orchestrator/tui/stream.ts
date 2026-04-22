export class StreamView {
  private lines: string[] = [];

  constructor(private readonly maxLines: number) {}

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) this.lines.shift();
  }

  render(): string {
    return this.lines.map((line) => `> ${line}`).join('\n');
  }
}
