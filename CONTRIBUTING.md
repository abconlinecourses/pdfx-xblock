# Contributing to the PDF XBlock

Thank you for your interest in contributing to the PDF XBlock! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Workflow](#workflow)
5. [Pull Request Process](#pull-request-process)
6. [Coding Standards](#coding-standards)
7. [Testing](#testing)
8. [Documentation](#documentation)
9. [Reporting Bugs](#reporting-bugs)
10. [Feature Requests](#feature-requests)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. By participating, you are expected to uphold this code. Please report unacceptable behavior.

## Getting Started

Before you begin:

1. Ensure you have a [GitHub account](https://github.com/signup/free)
2. [Fork the repository](https://help.github.com/articles/fork-a-repo/) on GitHub
3. [Clone your fork](https://help.github.com/articles/cloning-a-repository/) locally

## Development Setup

To set up your development environment:

1. Install Python 3.8 or higher
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Unix/macOS
   venv\Scripts\activate     # Windows
   ```
3. Install development dependencies:
   ```bash
   pip install -e ".[dev]"
   ```
4. Install the Open edX devstack for testing (optional but recommended):
   - Follow the [installation instructions](https://edx.readthedocs.io/projects/edx-installing-configuring-and-running/en/latest/installation/index.html)

## Workflow

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   or
   ```bash
   git checkout -b fix/your-bugfix-name
   ```

2. Make your changes

3. Run the tests to ensure everything is working:
   ```bash
   python -m pytest
   ```

4. Commit your changes:
   ```bash
   git commit -am "Add your detailed commit message"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. [Create a pull request](https://help.github.com/articles/creating-a-pull-request/)

## Pull Request Process

1. Update the README.md or documentation with details of changes if appropriate
2. Ensure all tests pass
3. Update the CHANGELOG.md with details of changes
4. The PR will be merged once it receives approval from maintainers

## Coding Standards

This project follows:

- [PEP 8](https://www.python.org/dev/peps/pep-0008/) for Python code
- [EdX JavaScript Style Guide](https://edx.readthedocs.io/projects/edx-developer-guide/en/latest/style_guides/javascript-guidelines.html) for JavaScript code

Additionally:

- Use 4 spaces for indentation (not tabs)
- Use docstrings for all classes and functions
- Add type hints to function signatures
- Use clear, descriptive variable and function names
- Write self-documenting code (avoid unnecessary comments)

## Testing

- Write tests for all new features and bugfixes
- Ensure all tests pass before submitting a pull request
- Aim for at least 90% test coverage for new code
- Test both common and edge cases

Run tests with:
```bash
python -m pytest
```

## Documentation

- Update documentation when changing functionality
- Use clear, concise language
- Include examples where appropriate
- Ensure documentation builds without errors:
  ```bash
  cd docs && make html
  ```

## Reporting Bugs

Report bugs by [creating an issue](https://github.com/yourusername/pdfx-xblock/issues/new) on GitHub.

Include:
- A descriptive title
- A clear description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Environment information (browser, OS, etc.)

## Feature Requests

Feature requests are welcome. [Create an issue](https://github.com/yourusername/pdfx-xblock/issues/new) on GitHub with:

- A clear description of the feature
- Rationale for the feature
- Example use cases
- Potential implementation approach if you have one in mind

Thank you for contributing to the PDF XBlock!