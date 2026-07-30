import subprocess
import sys

class Ataj:
  @staticmethod
  def run(file: str):
    return subprocess.run(['./atajc', 'run', file], check=True)

  @staticmethod
  def deploy(clouds: list):
    return subprocess.run(['./atajc', 'deploy', '--multi-cloud', ','.join(clouds)], check=True)

  @staticmethod
  def test():
    return subprocess.run(['./atajc', 'test', '--tier', 'all'], check=True)

if __name__ == "__main__":
  Ataj.run(sys.argv[1])
