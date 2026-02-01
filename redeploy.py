#!/usr/bin/env python3
"""
Скрипт для принудительного перезапуска Railway
"""

import os
import time
from datetime import datetime


def create_empty_commit():
    """Создать пустой коммит для триггера деплоя"""
    print("🔄 Создаю пустой коммит...")

    commands = [
        "git add .",
        'git commit --allow-empty -m "🚀 Trigger Railway redeploy - ' + datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S") + '"',
        "git push"
    ]

    for cmd in commands:
        print(f"▶️  Выполняю: {cmd}")
        result = os.system(cmd)
        if result != 0:
            print(f"⚠️  Команда завершилась с кодом {result}")

    print("✅ Пустой коммит создан и отправлен")
    print("📡 Railway автоматически запустит новый деплой")


def update_timestamp_file():
    """Обновить файл с timestamp для триггера деплоя"""
    print("🕒 Обновляю timestamp файл...")

    timestamp = datetime.now().isoformat()

    with open("DEPLOY_TIMESTAMP", "w") as f:
        f.write(timestamp)

    # Добавляем в git
    os.system("git add DEPLOY_TIMESTAMP")
    os.system(f'git commit -m "📅 Update deploy timestamp: {timestamp}"')
    os.system("git push")

    print("✅ Timestamp обновлен")


def redeploy_instructions():
    """Показать все способы перезапуска"""
    print("\n" + "=" * 60)
    print("🚀 СПОСОБЫ ПЕРЕЗАПУСТИТЬ RAILWAY")
    print("=" * 60)

    methods = [
        {
            "name": "1. Создать пустой коммит (рекомендуется)",
            "command": "python redeploy.py --empty-commit",
            "desc": "Создает пустой коммит, который триггерит деплой"
        },
        {
            "name": "2. Обновить requirements.txt",
            "command": "touch requirements.txt && git add . && git commit -m 'Update' && git push",
            "desc": "Простое обновление файла зависимостей"
        },
        {
            "name": "3. Через Railway Dashboard",
            "desc": "Зайдите в Railway → Deployments → Redeploy"
        },
        {
            "name": "4. Railway CLI",
            "command": "railway up",
            "desc": "Требует установленный Railway CLI"
        },
        {
            "name": "5. Через GitHub (если настроен)",
            "desc": "Зайдите в Actions → Запустите workflow вручную"
        }
    ]

    for method in methods:
        print(f"\n{method['name']}")
        print(f"   📝 {method['desc']}")
        if 'command' in method:
            print(f"   💻 {method['command']}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Перезапуск Railway деплоя")
    parser.add_argument("--empty-commit", action="store_true", help="Создать пустой коммит")
    parser.add_argument("--timestamp", action="store_true", help="Обновить timestamp файл")
    parser.add_argument("--all", action="store_true", help="Все методы")

    args = parser.parse_args()

    if args.empty_commit:
        create_empty_commit()
    elif args.timestamp:
        update_timestamp_file()
    elif args.all:
        print("🔄 Запускаю все методы...")
        update_timestamp_file()
        time.sleep(2)
        create_empty_commit()
        redeploy_instructions()
    else:
        redeploy_instructions()