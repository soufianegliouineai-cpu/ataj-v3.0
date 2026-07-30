use crate::ast::Stmt;

pub fn parse(input: &str) -> Vec<Stmt> {
    let mut stmts = Vec::new();
    for line in input.lines() {
        if line.starts_with("APP") {
            stmts.push(parse_app(line));
        }
        if line.starts_with("DO") {
            stmts.push(parse_do(line));
        }
        //... 6 more keywords
    }
    stmts
}

fn parse_app(line: &str) -> Stmt { todo!() }
fn parse_do(line: &str) -> Stmt { todo!() }
