#!/usr/bin/env python3
"""
Скрипт для обновления зависимостей и принудительного перезапуска Railway
"""

import subprocess
import sys
import os
from pathlib import Path


def check_requirements():
    """Проверить requirements.txt на конфликты"""
    print("🔍 Проверка requirements.txt на конфликты...")

    requirements_path = Path("backend/requirements.txt")
    if not requirements_path.exists():
        requirements_path = Path("requirements.txt")

    if not requirements_path.exists():
        print("❌ requirements.txt не найден!")
        return False

    with open(requirements_path, 'r') as f:
        content = f.read()

    # Проверка на явные конфликты
    conflicts = [
        ("aiogram", "aiohttp", "aiogram требует aiohttp<3.9.0"),
        ("aiogram", "python-telegram-bot", "Нельзя использовать оба фреймворка вместе"),
    ]

    for pkg1, pkg2, reason in conflicts:
        if pkg1 in content and pkg2 in content:
            print(f"⚠️  Конфликт: {pkg1} и {pkg2}")
            print(f"   Причина: {reason}")

    print("✅ requirements.txt проверен")
    return True


def create_safe_requirements():
    """Создать безопасный requirements.txt без конфликтов"""
    print("\n📝 Создание безопасного requirements.txt...")

    safe_requirements = """# Основные зависимости для Task Tracker Bot
fastapi==0.104.1
uvicorn[standard]==0.24.0
sqlalchemy==2.0.23
aiogram==2.25.1
python-multipart==0.0.6
python-dotenv==1.0.0
pytz==2023.3.post1
pydantic==2.5.3
"""

    with open("requirements.txt", "w") as f:
        f.write(safe_requirements)

    print("✅ Безопасный requirements.txt создан")
    return safe_requirements


def trigger_railway_deploy():
    """Запустить новый деплой в Railway через CLI"""
    print("\n🚀 Запуск нового деплоя в Railway...")

    try:
        # Проверяем наличие Railway CLI
        result = subprocess.run(["which", "railway"], capture_output=True, text=True)
        if result.returncode != 0:
            print("⚠️  Railway CLI не установлен")
            print("Установите: npm i -g @railway/cli")
            return False

        # Запускаем деплой
        print("Выполняем railway up...")
        result = subprocess.run(["railway", "up"], capture_output=True, text=True)

        if result.returncode == 0:
            print("✅ Деплой запущен успешно!")
            print(result.stdout)
            return True
        else:
            print("❌ Ошибка при запуске деплоя:")
            print(result.stderr)
            return False

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return False


def manual_redeploy_instructions():
    """Инструкции для ручного перезапуска"""
    print("\n📋 ИНСТРУКЦИИ ДЛЯ РУЧНОГО ПЕРЕЗАПУСКА RAILWAY:")
    print("=" * 50)
    print("1. Войдите в Railway Dashboard")
    print("2. Выберите ваш проект")
    print("3. Нажмите 'Deployments' в левом меню")
    print("4. Найдите текущий деплоймент")
    print("5. Нажмите 'Redeploy' (кнопка с двумя стрелками)")
    print("6. Или создайте новый деплоймент из текущей ветки")
    print("=" * 50)

    print("\n🚀 Или используйте Railway CLI:")
    print("railway up")

    print("\n🔄 Или сделайте пустой коммит в Git:")
    print('git commit --allow-empty -m "Trigger Railway deploy"')
    print("git push")


def add_health_endpoint():
    """Добавить health endpoint в main.py если его нет"""
    print("\n🏥 Проверка health endpoint...")

    main_py_path = Path("backend/main.py")
    if not main_py_path.exists():
        print("❌ backend/main.py не найден")
        return False

    with open(main_py_path, 'r') as f:
        content = f.read()

    if "@app.get(\"/health\")" in content or "health_check" in content:
        print("✅ Health endpoint уже существует")
        return True

    # Добавляем health endpoint
    health_code = '''
@app.get("/health")
async def health_check():
    """Проверка работоспособности сервиса"""
    return {
        "status": "healthy",
        "service": "task-tracker",
        "timestamp": datetime.utcnow().isoformat()
    }
'''

    # Находим место для добавления
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'app = FastAPI(' in line:
            # Добавляем импорт datetime если его нет
            if 'from datetime import datetime' not in content:
                lines.insert(1, 'from datetime import datetime')
            # Добавляем health endpoint после всех роутов
            for j in range(len(lines) - 1, i, -1):
                if '@app.' in lines[j]:
                    lines.insert(j + 1, health_code)
                    break
            break

    with open(main_py_path, 'w') as f:
        f.write('\n'.join(lines))

    print("✅ Health endpoint добавлен в main.py")
    return True


def create_deploy_script():
    """Создать скрипт для деплоя"""
    print("\n📁 Создание скриптов для деплоя...")

    # deploy.sh для Linux/Mac
    deploy_sh = """#!/bin/bash
# Скрипт для деплоя на Railway

echo "🚀 Запуск деплоя на Railway..."

# Проверяем наличие Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI не установлен"
    echo "Установите: npm i -g @railway/cli"
    exit 1
fi

# Проверяем требования
if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt не найден"
    exit 1
fi

# Запускаем деплой
echo "📦 Запускаем railway up..."
railway up

if [ $? -eq 0 ]; then
    echo "✅ Деплой успешно запущен!"
    echo "📊 Проверьте статус: railway logs"
else
    echo "❌ Ошибка при деплое"
    exit 1
fi
"""

    # deploy.ps1 для Windows
    deploy_ps1 = """# Скрипт для деплоя на Railway (PowerShell)

Write-Host "🚀 Запуск деплоя на Railway..." -ForegroundColor Green

# Проверяем наличие Railway CLI
try {
    $railwayCheck = Get-Command railway -ErrorAction Stop
    Write-Host "✅ Railway CLI установлен" -ForegroundColor Green
} catch {
    Write-Host "❌ Railway CLI не установлен" -ForegroundColor Red
    Write-Host "Установите: npm i -g @railway/cli" -ForegroundColor Yellow
    exit 1
}

# Проверяем требования
if (-Not (Test-Path "requirements.txt")) {
    Write-Host "❌ requirements.txt не найден" -ForegroundColor Red
    exit 1
}

# Запускаем деплой
Write-Host "📦 Запускаем railway up..." -ForegroundColor Cyan
railway up

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Деплой успешно запущен!" -ForegroundColor Green
    Write-Host "📊 Проверьте статус: railway logs" -ForegroundColor Cyan
} else {
    Write-Host "❌ Ошибка при деплое" -ForegroundColor Red
    exit 1
}
"""

    # Создаем скрипты
    with open("deploy.sh", "w") as f:
        f.write(deploy_sh)

    with open("deploy.ps1", "w") as f:
        f.write(deploy_ps1)

    # Делаем скрипт исполняемым
    os.chmod("deploy.sh", 0o755)

    print("✅ Скрипты созданы:")
    print("   - deploy.sh (Linux/Mac)")
    print("   - deploy.ps1 (Windows)")
    print("   Используйте: ./deploy.sh  или  ./deploy.ps1")


def main():
    """Главная функция"""
    print("=" * 50)
    print("🛠️  Railway Deploy Helper")
    print("=" * 50)

    # Проверяем текущую директорию
    cwd = Path.cwd()
    print(f"📁 Текущая директория: {cwd}")

    # Опции
    print("\n🔧 Доступные действия:")
    print("1. Проверить requirements.txt")
    print("2. Создать безопасный requirements.txt")
    print("3. Добавить health endpoint")
    print("4. Создать скрипты для деплоя")
    print("5. Показать инструкции для ручного перезапуска")
    print("6. Запустить деплой через Railway CLI")
    print("7. Выполнить все действия")
    print("0. Выход")

    try:
        choice = input("\n🎯 Выберите действие (0-7): ").strip()

        if choice == "1":
            check_requirements()
        elif choice == "2":
            create_safe_requirements()
        elif choice == "3":
            add_health_endpoint()
        elif choice == "4":
            create_deploy_script()
        elif choice == "5":
            manual_redeploy_instructions()
        elif choice == "6":
            trigger_railway_deploy()
        elif choice == "7":
            print("\n🚀 Выполняю все действия...")
            check_requirements()
            create_safe_requirements()
            add_health_endpoint()
            create_deploy_script()
            manual_redeploy_instructions()
            if input("\nЗапустить деплой сейчас? (y/n): ").lower() == 'y':
                trigger_railway_deploy()
        elif choice == "0":
            print("👋 Выход")
            return
        else:
            print("❌ Неверный выбор")

    except KeyboardInterrupt:
        print("\n👋 Прервано пользователем")
    except Exception as e:
        print(f"❌ Ошибка: {e}")


if __name__ == "__main__":
    main()