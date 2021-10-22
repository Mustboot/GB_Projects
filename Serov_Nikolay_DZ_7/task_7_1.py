#! /usr/bin/python3

import os

project_path = 'my_project'
paths = ['settings', 'mainapp', 'adminapp', 'authapp']

for new_dir in paths:
    os.makedirs(os.path.join(os.curdir, project_path, new_dir), exist_ok=True)
