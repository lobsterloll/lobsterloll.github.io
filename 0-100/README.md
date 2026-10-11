# Roblox Driving Empire 0–300 타이머

Windows에서 Roblox Driving Empire의 화면 속 속도계를 읽고 한 번의 주행에서 0–100, 0–200, 0–300 km/h 시간을 기록하는 오버레이입니다. 최고 기록과 속도계 캡처 영역은 %LOCALAPPDATA%\0-100timer\settings.json에 저장됩니다.

## 프로젝트 구조

- src/app.py: 항상 위에 표시되는 창, 화면 캡처, W 키 감지, 기록 저장.
- src/timer.py: 속도 숫자 판독과 100/200/300 km/h 도달 시간 계산.
- src/zero-template.png: 게임 속 0 숫자의 판독 기준.
- src/app.ico: 앱 아이콘.
- tests/: 동작 테스트와 fixtures/의 실제 속도계 이미지.
- 0-100timer.spec: PyInstaller 단일 EXE 빌드 설정.
- requirements.txt: 실행에 필요한 Python 패키지.

실행 코드와 테스트 자료는 src/와 tests/에서 관리합니다. 빌드하면 만들어지는 build/, dist/ 및 EXE는 이 프로젝트에 보관하지 않습니다.

## 소스에서 실행

Windows에 Python 3.11 이상을 설치한 뒤, 프로젝트 폴더에서 PowerShell을 열어 실행합니다.

    python -m pip install -r requirements.txt
    python src/app.py

콘솔 창 없이 소스에서 실행하려면 pythonw src/app.py를 사용합니다. 이 PC의 바탕화면과 프로젝트 폴더에 있는 **OPEN ROBLOX TIMER** 바로 가기는 D:\github\lobsterloll\downloads\Roblox-0-300-Timer.exe를 엽니다. 이 EXE는 웹사이트 배포용이며 소스 프로젝트 밖에 있습니다. 다른 PC에서 소스를 실행하려면 먼저 위의 패키지를 설치해야 합니다.

## 테스트

프로젝트 폴더에서 다음 명령을 실행합니다.

    python -m unittest discover -s tests -t . -v

테스트는 실제 HUD 이미지의 0/100/300 판독, 200 오인 방지, W 키 시작, 각 구간 기록, 같은 이미지가 연속 캡처될 때의 입력 처리 등을 확인합니다.

## 단일 EXE 빌드

프로젝트 폴더에서 실행합니다.

    python -m pip install -r requirements.txt pyinstaller
    python -m PyInstaller --noconfirm --clean 0-100timer.spec
    .\dist\Roblox-0-300-Timer.exe

빌드 결과는 dist/Roblox-0-300-Timer.exe입니다. 한 파일에 Python, 라이브러리, 기준 이미지와 아이콘이 들어가므로 다른 Windows PC에는 Python 설치가 필요하지 않습니다. EXE는 빌드 결과물이므로 소스 폴더를 정리할 때 삭제해도 위 명령으로 다시 만들 수 있습니다. 서명하지 않은 EXE는 Windows Smart App Control에서 차단할 수 있습니다.

## 사용 방법

Driving Empire를 창 또는 테두리 없는 창 모드로 표시합니다. **Record again**을 누르고 속도계가 0 km/h일 때 READY · press W가 나타나면 W를 눌러 출발합니다. W를 누른 상태에서 **Record again**을 누르면 새 주행이 시작되지 않으므로 W를 떼었다가 다시 누릅니다. Space 키는 사용하지 않습니다.

속도계의 표시가 100, 200, 300 km/h를 넘는 첫 캡처에서 각 기록이 고정됩니다. **Clear bests**는 최고 기록을 삭제합니다. HUD 위치가 달라졌다면 **Set speed area**에서 큰 흰색 속도 숫자만 선택하고, KM/H와 아래쪽 막대는 제외합니다. 영역 선택은 Esc로 취소할 수 있습니다.

앱은 기본 화면에서 GPU를 이용하는 DirectX 캡처를 사용하고 초당 120회 캡처를 목표로 합니다. 창 오른쪽 위 CAPTURES/S 수치는 실제 캡처 횟수입니다. GPU 부하가 높으면 속도가 떨어질 수 있고, 화면이 60 Hz이면 일부 캡처에는 같은 게임 프레임이 반복됩니다. 숫자 판독과 창 처리는 CPU에서 수행됩니다. DirectX 캡처가 잠시 실패하면 느린 대체 방식으로 전환하고 다시 시도합니다. 기록은 캡처 시각을 사용하지만, 화면에 표시되지 않은 순간의 실제 차량 속도까지 측정할 수는 없습니다.
