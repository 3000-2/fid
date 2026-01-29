export async function copyToClipboard(text: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy"]
      : process.platform === "win32"
        ? ["clip"]
        : ["xclip", "-selection", "clipboard"]

  const proc = Bun.spawn(cmd, { stdin: "pipe" })
  proc.stdin.write(text)
  proc.stdin.end()
  await proc.exited
}
