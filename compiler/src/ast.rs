#[derive(Debug, Clone)]
pub enum Stmt {
 App { name: String, clouds: Vec<String> },
 Have { name: String, fields: Vec<Field> },
 Show { name: String },
 Do { name: String, modifiers: Vec<String>, body: Vec<Expr> },
 Use { name: String, pin: Option<String> },
 When { cron: String, action: String },
 On { event: String, action: String },
}

#[derive(Debug, Clone)]
pub struct Field {
 pub name: String,
 pub ty: String,
 pub secure: bool
}

#[derive(Debug, Clone)]
pub enum Expr {
 Call(String),
 Emit(String),
 If { cond: String, then: Box<Expr> }
}
