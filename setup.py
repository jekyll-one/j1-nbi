"""
A Jupyter nbconvert exporter to convert notebooks and their widgets to publicly
runnable HTML files.
"""
# Always prefer setuptools over distutils
from setuptools import setup
from setuptools.command.test import test as TestCommand

# To use a consistent encoding
from codecs import open
from os import path
import sys

# Package version
version = '1.0.1'

here = path.abspath(path.dirname(__file__))

# Get the long description from the README file
with open(path.join(here, 'README.md'), encoding='utf-8') as f:
    long_description = f.read()

# Get requirements from requirements.txt
with open(path.join(here, 'requirements.txt'), encoding='utf-8') as f:
    install_requires = f.readlines()


class PyTest(TestCommand):
    user_options = [('pytest-args=', 'a', "Arguments to pass to py.test")]

    def initialize_options(self):
        TestCommand.initialize_options(self)
        self.pytest_args = ['tests']

    def finalize_options(self):
        TestCommand.finalize_options(self)

    def run_tests(self):
        # import here, cause outside the eggs aren't loaded
        import pytest
        errno = pytest.main(self.pytest_args)
        sys.exit(errno)


setup(
    name='j1-nbinteract',
    version=version,
    description='Export interactive HTML pages from Jupyter Notebooks',
    long_description=long_description,
    long_description_content_type='text/markdown',
    url='https://github.com/jekyll-one/j1-nbinteract',
    author='Juergen Adams',
    author_email='jadams@gmx.de',
    license='MIT',

    # See https://pypi.python.org/pypi?%3Aaction=list_classifiers
    classifiers=[
        'Development Status :: 3 - Alpha',
        'Intended Audience :: Developers',
        'Topic :: Software Development :: Build Tools',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Framework :: Jupyter',
    ],
    keywords='jupyter nbconvert interact',
    packages=['j1-nbinteract'],
    package_data={'j1-nbinteract': ['templates/*.tpl']},
    install_requires=install_requires,
    extras_require={
        'dev': ['check-manifest'],
        'test': ['pytest', 'coverage', 'coveralls'],
    },
    cmdclass={'test': PyTest},

    # Add exporter to nbconvert CLI:
    # https://nbconvert.readthedocs.io/en/latest/external_exporters.html
    entry_points={
        'nbconvert.exporters': ['interact = nbinteract:InteractExporter'],
        'console_scripts': ['nbinteract = nbinteract.cli:main'],
    }
)
