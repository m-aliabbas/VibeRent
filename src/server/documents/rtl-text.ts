export function wrapRtlText(
  value: string,
  fits: (candidate: string) => boolean,
): string[] {
  const rendered: string[] = [];
  for (const paragraph of value.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      rendered.push("");
      continue;
    }
    let line: string[] = [];
    for (const word of words) {
      const candidate = [...line, word].join(" ");
      if (line.length && !fits(candidate)) {
        rendered.push(line.join(" "));
        line = [word];
      } else {
        line.push(word);
      }
    }
    if (line.length) rendered.push(line.join(" "));
  }
  return rendered;
}
