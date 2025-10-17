#how many lines of code in the current directory and its subdirectories
import os
def count_lines_of_code(directory):
    total_lines = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):  # You can change this to count other file types
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()
                    total_lines += len(lines)
    return total_lines
if __name__ == "__main__":
    directory = os.getcwd()  # Current directory
    lines_count = count_lines_of_code(directory)
    print(f"Total lines of code in '{directory}': {lines_count}")
