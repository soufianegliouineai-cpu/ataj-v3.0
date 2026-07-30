package ataj

import (
  "os"
  "os/exec"
  "strings"
)

func Run(file string) error {
  cmd := exec.Command("./atajc", "run", file)
  cmd.Stdout = os.Stdout
  cmd.Stderr = os.Stderr
  return cmd.Run()
}

func Deploy(clouds []string) error {
  cmd := exec.Command("./atajc", "deploy", "--multi-cloud", strings.Join(clouds, ","))
  return cmd.Run()
}
