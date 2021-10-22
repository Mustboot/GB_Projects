import os

settings = {}
with open('my_config.yaml') as f:
    lines = dict(map(str.split, f.readlines()))

basedir = lines.pop('base_dir')
for key, value in lines.items():
    os.makedirs(os.path.join(os.curdir, basedir, key), exist_ok=True)
    for i in value.split(','):
        with open(os.path.join(os.curdir, basedir, key, i), 'w') as f:
            pass
