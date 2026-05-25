import { spawn } from 'node:child_process';

/**
 * Thin wrapper over a direct ffmpeg/ffprobe child process. The spec prefers
 * direct invocation over fluent-ffmpeg for control (§1).
 */
export function run(bin: 'ffmpeg' | 'ffprobe', args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout || stderr);
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
