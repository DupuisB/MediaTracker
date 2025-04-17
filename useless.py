import os

# Supported code file extensions
CODE_EXTENSIONS = {'.js', '.java', '.cpp', '.c', '.rb', '.go', '.php', '.html', '.css', '.hbs', '.json'}

def generate_markdown(folder_path):
    """Generate the markdown file for both folder structure and code content in a single loop."""
    markdown_content = f"# Folder Architecture for `{folder_path}`\n\n"
    markdown_content += "## Folder Structure\n\n"
    
    file_structure_content = []
    code_files_content = []
    
    exclude_files = ["package-lock.json"]
    
    for root, dirs, files in os.walk(folder_path):
        # Skip node_modules directories
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        # Remove all .* directories from the list of directories to walk into
        dirs[:] = [d for d in dirs if not d.startswith('.')]
            
        level = root.replace(folder_path, '').count(os.sep)
        indent = ' ' * 4 * level
        folder_name = os.path.basename(root) or os.path.basename(folder_path)
        
        # Add folder to the file structure
        file_structure_content.append(f"{indent}- {folder_name}/")
        
        for file in files:
            file_extension = os.path.splitext(file)[1].lower()
            file_name = os.path.basename(file)
            file_structure_content.append(f"{indent}    - {file}")
            
            # Extract code content for supported file types
            if (file_extension in CODE_EXTENSIONS and 
                file_name not in exclude_files and 
                not file_name.startswith('.')):
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        code = f.read()
                    
                    code_files_content.append(f"### {file}\n\n")
                    code_files_content.append(f"```{file_extension[1:]}\n")
                    code_files_content.append(f"{code}\n")
                    code_files_content.append("```\n\n")
                except Exception as e:
                    code_files_content.append(f"### {file}\n\n")
                    code_files_content.append(f"Error reading file: {str(e)}\n\n")
    
    # Combine both sections
    markdown_content += "\n".join(file_structure_content) + "\n\n"
    markdown_content += "## Code Files\n\n"
    markdown_content += "".join(code_files_content)
    
    return markdown_content

def save_markdown(markdown_content, output_file):
    """Save the markdown content to a file."""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(markdown_content)

def main():
    folder_path = "/home/benjamin/Documents/Télécom/IGR/MediaTracker/"
    output_file = "folder_structure.md"
    
    if not os.path.isdir(folder_path):
        print(f"The provided path '{folder_path}' is not a valid directory.")
        return
    
    # Generate markdown content
    markdown_content = generate_markdown(folder_path)
    
    # Save the markdown content to the output file
    save_markdown(markdown_content, output_file)
    print(f"Markdown documentation has been saved to {output_file}")

if __name__ == "__main__":
    main()
