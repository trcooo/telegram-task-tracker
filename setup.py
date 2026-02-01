from setuptools import setup, find_packages

setup(
    name="telegram-task-tracker",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "fastapi>=0.104.1",
        "uvicorn[standard]>=0.24.0",
        "sqlalchemy>=2.0.23",
        "aiogram>=2.25.1",
        "python-multipart>=0.0.6",
        "python-dotenv>=1.0.0",
        "pytz>=2023.3",
        "pydantic>=2.5.3",
    ],
    python_requires=">=3.8",
)