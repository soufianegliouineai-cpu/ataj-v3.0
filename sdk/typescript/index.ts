import { spawn, ChildProcess } from 'child_process';

export class Ataj {
  static run(file: string): ChildProcess {
    return spawn('./atajc', ['run', file], { stdio: 'inherit' });
  }
  static deploy(clouds: string[]): ChildProcess {
    return spawn('./atajc', ['deploy', '--multi-cloud', clouds.join(',')], { stdio: 'inherit' });
  }
  static test(): ChildProcess {
    return spawn('./atajc', ['test', '--tier', 'all'], { stdio: 'inherit' });
  }
}
export default Ataj;
