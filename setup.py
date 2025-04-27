"""
Setup file for the PDF XBlock.
"""

import os
from setuptools import setup

def package_data(pkg, roots):
    """Generic function to find package_data.

    All of the files under each of the `roots` will be declared as package
    data for package `pkg`.
    """
    data = []
    for root in roots:
        for dirname, _, files in os.walk(os.path.join(pkg, root)):
            for fname in files:
                data.append(os.path.relpath(os.path.join(dirname, fname), pkg))

    return {pkg: data}

setup(
    name='pdfx-xblock',
    version='0.1.0',
    description='PDF Viewer XBlock for Open edX',
    license='MIT',
    packages=[
        'pdfx',
    ],
    install_requires=[
        'XBlock',
    ],
    entry_points={
        'xblock.v1': [
            'pdfx = pdfx:PdfxXBlock',
        ]
    },
    package_data=package_data("pdfx", ["static", "public", "static/html", "static/css", "static/js", "static/js/src", "static/vendor"]),
    classifiers=[
        'Development Status :: 3 - Alpha',
        'Environment :: Web Environment',
        'Framework :: Django',
        'Framework :: Django :: 3.2',
        'Intended Audience :: Education',
        'License :: OSI Approved :: GNU Affero General Public License v3',
        'Operating System :: OS Independent',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Topic :: Education',
        'Topic :: Education :: Computer Aided Instruction (CAI)',
    ],
    keywords='python edx xblock pdf viewer annotation',
)