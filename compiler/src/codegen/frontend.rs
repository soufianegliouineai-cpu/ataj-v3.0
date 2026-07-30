use serde_json::Value;

use crate::ast::{EventNode, ShowNode};

pub fn codegen_show(node: &ShowNode) -> String {
    // Define default layouts for known component types
    let default_layouts = std::collections::HashMap::from([
        ("Header", "flex row items-center justify-between bg-black text-gold p-4"),
        ("Title", "text-5xl font-bold text-center"),
        ("Subtitle", "text-xl text-center text-gray-400 mt-4"),
        ("Stat", "flex flex-col items-center p-6 bg-white rounded-xl shadow"),
        ("Product", "bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition"),
        ("Card", "bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition"),
        ("Section", ""),
        ("Footer", "text-center py-6 bg-gray-800 text-gray-400"),
        ("Grid", ""),
        ("Button", "px-6 py-3 rounded-lg font-semibold transition"),
        // Add more as needed
    ]);

    // Define the expected slots for each component type for implicit data binding
    // We'll map component type to a list of slot names in order
    let slots_map = std::collections::HashMap::from([
        ("Header", vec!["title", "links"]),
        ("Title", vec!["text"]),
        ("Subtitle", vec!["text"]),
        ("Stat", vec!["number", "label"]),
        ("Product", vec!["image", "category", "name", "description", "price", "compare_at"]),
        ("Card", vec!["data"]), // Generic card: expects a single data object
        ("Button", vec!["text"]),
        // For Section, we don't have slots; it's just a container
        // For Footer, we have a text slot
        ("Footer", vec!["text"]),
    ]);

    let component_type = node.comp_type.as_str();
    let args = &node.args;
    let layout_opt = node.layout.as_deref(); // Option<&str>

    // Get the default layout for this component type
    let default_layout = default_layouts.get(component_type).copied().unwrap_or("");

    // Determine the final layout: if layout_opt is Some, use it; else use default.
    // If layout_opt is Some and empty string, we still use the empty string (meaning no default? 
    // We'll treat empty string as explicit no layout, so we don't add default.
    // But if layout_opt is None, we use default.
    let layout = if let Some(layout_str) = layout_opt {
        if layout_str.is_empty() {
            String::new()
        } else {
            layout_str.to_string()
        }
    } else {
        default_layout.to_string()
    };

    // Now, generate the JSX based on component type
    let mut class_name = layout;
    // If we have a default layout and we didn't override it with an empty string, we already set it.
    // If the user provided a layout, we use that only (no default mixed in).

    match component_type {
        "Header" => {
            // EXPECTED ARGS: [title, links]
            let title = args.get(0).cloned().unwrap_or_default();
            let links = args.get(1).cloned().unwrap_or(Value::Array(vec![]));
            // If the args are simple strings, we can use them directly.
            // For Header, we expect title: string, links: array of strings
            format!(
                r#"<header className="{}" data-title={} data-links={} />"#,
                class_name, title, links
            )
        }
        "Title" => {
            // EXPECTED ARGS: [text]
            let text = args.get(0).cloned().unwrap_or_default();
            format!(r#"<h1 className="{}" data-text={} />"#,
                class_name, text
            )
        }
        "Subtitle" => {
            // EXPECTED ARGS: [text]
            let text = args.get(0).cloned().unwrap_or_default();
            format!(r#"<h2 className="{}" data-text={} />"#,
                class_name, text
            )
        }
        "Stat" => {
            // EXPECTED ARGS: [number, label]
            let number = args.get(0).cloned().unwrap_or_default();
            let label = args.get(1).cloned().unwrap_or_default();
            // If number or label are simple values (string or number), we can use them directly.
            // If they are objects, we might need to extract specific fields? 
            // For simplicity, we'll just pass them as is and assume the component knows how to handle.
            format!(r#"<div className="{}" data-number={} data-label={} />"#,
                class_name, number, label
            )
        }
        "Product" => {
            // EXPECTED ARGS: [product_object] OR [image, category, name, description, price, compare_at]
            // We'll check if the first argument is an object with known keys.
            // For simplicity, we'll treat the first argument as the product object and pass it as data.
            // If the user wants to pass individual fields, they can do so and we'll treat as a single object? 
            // Actually, we want to support both: 
            //   SHOW Product product_obj
            //   SHOW Product image category name description price compare_at
            // We'll detect: if args.len() == 1 and the arg is an object, we treat it as the product object.
            // If args.len() >= 6, we treat them as the individual fields.
            // Otherwise, we fallback to passing the first arg as data.
            if args.len() == 1 {
                // Single argument: assume it's the product object
                let data = args.get(0).cloned().unwrap_or_default();
                format!(r#"<div className="{}" data-product={} />"#,
                    class_name, data
                )
            } else if args.len() >= 6 {
                // Multiple arguments: assume they are image, category, name, description, price, compare_at
                let image = args.get(0).cloned().unwrap_or_default();
                let category = args.get(1).cloned().unwrap_or_default();
                let name = args.get(2).cloned().unwrap_or_default();
                let description = args.get(3).cloned().unwrap_or_default();
                let price = args.get(4).cloned().unwrap_or_default();
                let compare_at = args.get(5).cloned().unwrap_or_default();
                format!(r#"<div className="{}" data-image={} data-category={} data-name={} data-description={} data-price={} data-compare_at={} />"#,
                    class_name, image, category, name, description, price, compare_at
                )
            } else {
                // Fallback: treat first arg as data
                let data = args.get(0).cloned().unwrap_or_default();
                format!(r#"<div className="{}" data-product={} />"#,
                    class_name, data
                )
            }
        }
        "Card" => {
            // EXPECTED ARGS: [data_object]  (generic card)
            // We'll treat the first arg as the data object.
            let data = args.get(0).cloned().unwrap_or_default();
            format!(r#"<div className="{}" data-card={} />"#,
                class_name, data
            )
        }
        "Section" => {
            // EXPECTED ARGS: [id]  (optional)
            let id = args.get(0).cloned().unwrap_or(Value::String(String::from("")));
            format!(r#"<section id={} className="{}" />"#,
                id, class_name
            )
        }
        "Footer" => {
            // EXPECTED ARGS: [text]
            let text = args.get(0).cloned().unwrap_or_default();
            format!(r#"<footer className="{}" data-text={} />"#,
                class_name, text
            )
        }
        "Grid" => {
            // EXPECTED ARGS: [cols, gap]  (optional)
            let cols = args.get(0).cloned().unwrap_or(Value::String(String::from("1")));
            let gap = args.get(1).cloned().unwrap_or(Value::String(String::from("0")));
            format!(r#"<div className="grid grid-cols-{} gap-{} {}" />"#,
                cols, gap, class_name
            )
        }
        "Button" => {
            // EXPECTED ARGS: [text]
            let text = args.get(0).cloned().unwrap_or_default();
            // We'll also look for an EVENT? Not handled here.
            format!(r#"<button className="{}" data-text={} />"#,
                class_name, text
            )
        }
        _ => {
            // Fallback for unknown components: treat all args as data to be passed as a single object?
            // Or we can just pass the first arg as data and ignore the rest? 
            // We'll do: if there is exactly one arg, pass it as data; else, pass all args as an array.
            if args.len() == 1 {
                let data = args.get(0).cloned().unwrap_or_default();
                format!(r#"<div className="{}" data-component="{}" data={} />"#,
                    class_name, component_type, data
                )
            } else {
                let args_str = args.iter()
                    .map(|arg| arg.to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(r#"<div className="{}" data-component="{}" data-args=[{}] />"#,
                    class_name, component_type, args_str
                )
            }
        }
    }
}

pub fn codegen_event(node: &EventNode) -> String {
    format!("on{}={{() => {}}}", node.name, node.action)
}

pub fn codegen_page(page: &super::PageNode) -> String {
    let mut imports = String::new();
    let mut components = String::new();

    // Generate JSX based on the simplified SHOW statements
    components.push_str("<div className=\"app\">\\n");
    
    for section in &page.sections {
        components.push_str(&format!("<section id=\"{}\">\\n", section.id));
        components.push_str(&format!("<div className=\"{}\">\\n", section.layout));

        for card in &section.cards {
            // Use the codegen_show function for each card
            let show_node = ShowNode {
                comp_type: card.ty.clone(),
                args: vec![card.data.clone()],
                layout: None, // We are not using layout from the card here; we rely on the ShowNode's layout field being set by the parser? 
                // Actually, in the current codegen_page, we are not setting the layout field of ShowNode.
                // We are setting the layout of the section div to section.layout, but for the card, we are not passing any layout.
                // We'll change: we will not pass any layout in the ShowNode's layout field, and let the codegen_show use the default layout for the component type.
                // If the user wants to specify a custom layout for the card, they must do so via the ATAJ layout attribute, which should be reflected in the ShowNode's layout field.
                // Since we don't have control over the parser, we'll assume that the parser sets the ShowNode's layout field appropriately.
                // For now, we'll leave it as None and rely on the defaults.
                content: String::new()
            };
            components.push_str(&codegen_show(&show_node));
            components.push_str("\\n");
        }

        components.push_str("</div>\\n</section>\\n");
    }

    components.push_str("</div>\\n");

    format!("{}export default function {}() {{ {} }}", imports, page.name, components)
}