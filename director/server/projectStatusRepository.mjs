import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 3_000;
const GIT_MAX_BUFFER_BYTES = 256 * 1024;

const safeString = (value, maximum) => String(value || '')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .trim()
  .slice(0, maximum);

export class ProjectStatusRepository {
  constructor({
    repositoryRoot,
    execFileImpl = execFileAsync,
    clock = () => new Date()
  }) {
    if (!repositoryRoot) throw new Error('Project status requires a repository root');
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.execFileImpl = execFileImpl;
    this.clock = clock;
  }

  async runGit(argumentsList) {
    const result = await this.execFileImpl('git', argumentsList, {
      cwd: this.repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES
    });
    return String(result?.stdout || '').trim();
  }

  async readStatus() {
    const [branchOutput, headOutput, subjectOutput, statusOutput, comparisonOutput] = await Promise.all([
      this.runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      this.runGit(['rev-parse', '--short=12', 'HEAD']),
      this.runGit(['log', '-1', '--pretty=%s']),
      this.runGit(['status', '--porcelain=v1', '--untracked-files=all']),
      this.runGit(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
    ]);
    const statusLines = statusOutput.split(/\r?\n/).filter(Boolean);
    const [behindText = '0', aheadText = '0'] = comparisonOutput.split(/\s+/);
    const behindMain = Number.parseInt(behindText, 10);
    const aheadMain = Number.parseInt(aheadText, 10);
    if (!Number.isInteger(behindMain) || !Number.isInteger(aheadMain)) {
      throw new Error('Git returned an invalid main-branch comparison');
    }

    return {
      generatedAt: this.clock().toISOString(),
      repository: {
        branch: safeString(branchOutput, 160),
        head: safeString(headOutput, 40),
        subject: safeString(subjectOutput, 240),
        dirtyCount: statusLines.length,
        untrackedCount: statusLines.filter((line) => line.startsWith('??')).length,
        aheadMain,
        behindMain
      }
    };
  }
}

export const PROJECT_STATUS_COMMAND_LIMITS = Object.freeze({
  timeoutMs: GIT_TIMEOUT_MS,
  maxBufferBytes: GIT_MAX_BUFFER_BYTES
});
