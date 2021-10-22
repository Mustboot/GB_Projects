import os
import shutil

my_path = r'my_project\templates'
for root, dirs, files in os.walk('my_project'):
    if root == my_path:
        break
    for file in files:
        if file.rsplit('.', 1)[1].lower() == 'html':
            os.makedirs(os.path.join(my_path, root.split('\\')[-1]), exist_ok=True)
            shutil.copyfile(os.path.join(root, file), os.path.join(my_path, os.path.join(root.split('\\')[-1], file)))
