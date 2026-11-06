# UE5 오픈월드 레이싱 게임 MVP — Codex 구현 명세

문서 상태: 구현 기준안 · 2026-10-01
언어: 한국어 · 플랫폼: Windows PC · 플레이 방식: 싱글플레이 오프라인

## 0. 이 문서의 사용법과 결정 원칙

이 문서는 이전 대화의 MVP 요구사항과 제3자 실현 가능성 검토를 통합한 **개발 계약**이다. Codex는 이 문서를 기준으로 Unreal Engine 프로젝트를 만들고, 아래 단계의 산출물을 순서대로 구현한다. 수치 중 `목표`는 성능 측정 전의 설계값이며, 실제 장비에서 검증한 수치만 `달성`이라고 기록한다. 목표 성능이 나오지 않으면 마지막 단계까지 기다리지 않고 각 단계의 성능 게이트에서 콘텐츠와 설정을 조정한다.

**우선순위:** 플레이 가능한 완결된 루프 → 차량의 외관·실내·동작 완성도 → 목표 장비에서의 프레임 안정성 → 월드 장식 밀도. 충돌하는 요구사항은 이 순서로 판단한다. 아트 자산의 제작·구매·라이선스 확보는 별도 입력이 필요하므로, Codex는 먼저 대체 가능한 임시 자산으로 시스템을 완성하고 최종 자산이 들어갈 규격과 검수 체크리스트를 제공한다. 고품질 차량 자산을 임시 메시로만 대체한 상태는 최종 MVP 합격이 아니다.

## 1. 제품 목표와 고정 범위

플레이어가 **고품질의 가상 스포츠 쿠페 1대**를 운전해 작은 개방형 월드를 자유 주행하고, 최대 20대의 일반 교통 차량 사이를 지나, **AI 상대 3대가 참가하는 Sprint Race 1개**를 시작부터 결과 화면까지 완료한다. 레이스 후에는 자유 주행으로 돌아갈 수 있다.

| 항목 | MVP 기준 |
|---|---|
| 엔진 | **Unreal Engine 5.8.x** C++ 프로젝트. 설치된 5.8 패치 버전까지 `.uproject`·`Docs/Build.md`에 기록하고, 다른 마이너 버전으로의 업그레이드는 별도 작업으로 취급한다. |
| 실행 환경 | Windows 패키지 빌드, 키보드 입력, 오프라인 싱글플레이 |
| 기준 장비 | Intel Core Ultra 5 125H, Intel Arc Graphics 7 Xe-core iGPU, 16 GB DDR5 듀얼채널, SSD |
| 출력 | 1920×1080. 내부 렌더 해상도 1280×720~1600×900 허용, TSR 사용 가능 |
| 목표 성능 | 기준 장비에서 60 FPS 평균 목표. 1% low 45 FPS 이상, 30 FPS 미만 연속 5초 없음. 아래 §13의 고정 시나리오에서 검증 |
| 월드 | 약 1~1.5 km² 플레이 가능 영역, 연결된 주행 도로 길이 총 3~5 km |
| 플레이어 차량 | 1대. **production Chaos Vehicles** 기반, 자동 변속, 후륜구동을 기본 튜닝안으로 사용. **Experimental Chaos Modular Vehicle 사용 금지** |
| 일반 교통 | 활성 풀의 상한 20대. 가까운 일부만 상세 AI·물리, 나머지는 거리 기반 단순화 |
| 레이스 | 단일 Sprint Race, 플레이어 + 레이싱 AI 3대 |
| 시점 | 일반 추격, 근접 추격, 실내, 보닛 4개 |
| 조명 | 고정된 낮/늦은 오후. 정적·베이크 조명 중심, 차량 등에 필요한 제한적 동적 그림자 |
| 주행 AI | 자체 구현한 규칙 기반 상태 기계 + 차선/레이싱 스플라인. 외부 API·NPU 불필요 |

**60 FPS는 설계 목표이며 사전 보장값이 아니다.** 특히 7 Xe-core 통합 GPU의 실제 성능은 메모리 속도, 전력 제한, 냉각, 드라이버와 노트북 설정에 좌우된다. 기준 장비에서 측정값이 게이트에 못 미치면 §13의 저비용 항목부터 줄이고 결과를 기록한다. 1080p는 **디스플레이 출력**을 뜻하며 네이티브 1080p 내부 렌더를 뜻하지 않는다.

## 2. 사용자 경험과 게임 흐름

1. 메인 메뉴에서 `Play`를 선택한다.
2. 플레이어 차량이 안전한 시작 지점에 생성된다. 4개 시점 중 기본 추격 카메라로 자유 주행한다.
3. 도심·주거지·산업지·외곽 도로·고속 구간을 연결된 도로망으로 주행한다. 교차로의 신호등과 교통 차량이 작동한다.
4. 월드의 레이스 마커에 접근해 키보드로 참가한다. 차량은 출발 위치로 안전하게 배치된다.
5. `3–2–1–GO` 카운트다운 후 체크포인트를 순서대로 통과한다. AI 3대가 동시에 주행한다.
6. 완주 순위·기록을 결과 화면에 표시한다. 결과 화면을 닫으면 자유 주행 상태로 복귀한다.
7. 언제든 일시정지·재시작·메인 메뉴 복귀를 할 수 있다. 전복 또는 고착 시 차량을 안전한 도로 위치로 복구한다.

레이스 시작과 결과 전환은 교통 풀·카메라·HUD의 상태를 명시적으로 변경한다. 중복 시작, 레이스 중 메뉴 이동, AI 차량 미완주, 체크포인트 역주행 같은 예외에도 소프트락이 없어야 한다.

## 3. 엔진, 프로젝트 설정, 렌더링 기준

### 3.1 초기 설정

- **Unreal Engine 5.8.x** C++ Games 프로젝트, Windows 대상. 정규 **Chaos Vehicles** 플러그인, `Enhanced Input`, `UMG`를 활성화한다. Hero Vehicle과 근거리 물리 차량은 production Chaos Vehicles 경로를 사용한다. **Experimental `Chaos Modular Vehicle` 플러그인·클래스·모듈·에셋은 프로젝트에서 사용하지 않으며 활성화하지 않는다.** 두 차량 시스템을 혼용하지 않는다.
- 설치된 UE **5.8 패치 버전**, Visual Studio/컴파일러, SDK, 필수 플러그인, Windows RHI, 드라이버 버전을 `Docs/Build.md`에 고정한다. 5.8.x의 API·설정과 공식 문서를 확인해 구현한다. 5.9 이상이나 5.7 이하로 자동 변경하지 않는다.
- `.uproject` 플러그인 목록과 모듈 의존성을 검수해 `ChaosModularVehicle` 참조가 없음을 확인한다. CI/빌드 검증에도 이 금지 조건을 포함한다.
- 패키지 실행 파일을 검수 기준으로 삼는다. Editor PIE 수치는 개발 참고치다.
- 정적 조명 사용을 허용하고 Lumen GI·Lumen Reflections 및 하드웨어 레이 트레이싱을 기본 설정에서 끈다. 고정 태양·하늘과 베이크된 환경 GI, Reflection Capture, 필요할 때만 가벼운 화면 공간 반사를 사용한다.
- **CPU Lightmass/정적 라이트맵**을 기준 베이크 경로로 잡는다. 기준 iGPU에서 GPU Lightmass를 필수 빌드 단계로 두지 않는다. 정적 메시에는 중복 없는 lightmap UV와 합리적인 해상도를 준비한다.
- World Partition은 필수가 아니다. 기본 월드는 단일 persistent level과 필요한 경우 소수의 수동 서브레벨로 구성해 정적 조명 워크플로를 단순화한다. World Partition을 켤 경우 베이크, 스트리밍, 패키징을 먼저 검증한다.
- 프리셋은 `Baseline`을 우선 완성한다. `Low`는 성능 완화, `High`는 기준 장비의 합격 조건이 아닌 선택 사항이다. 사용자가 설정을 저장·복구할 수 있게 한다.

### 3.2 해상도와 후처리

- 화면 출력은 1920×1080. 기본 후보는 **1600×900 내부 렌더 + TSR**이며, 실제 측정에 따라 1280×720까지 낮출 수 있다. 1600/1920 = 83.3%, 1280/1920 = 66.7%의 화면 비율로 이해하고 `Screen Percentage`를 조정한다.
- Windows 패키지에서 **고정 내부 해상도 + TSR**을 기본 구현으로 한다. 자동 동적 해상도는 채택한 엔진 버전과 Windows RHI에서 정상 동작을 실측으로 확인한 경우에만 켠다. 따라서 자동 동적 해상도가 작동하지 않아도 이 MVP는 완성 가능해야 한다.
- 광원·차량 페인트·유리·반사는 최종 화면에서 가독성을 우선한다. 과도한 모션 블러, 높은 품질의 스크린 공간 반사, 다수의 실시간 반사 캡처는 기준 프리셋에 넣지 않는다.
- Nanite는 **측정 후 선택적으로** 큰 정적 건물·복잡한 정적 구조물에만 사용한다. 도로, 작은 소품, 교통 차량, 투명도가 높은 식생은 일반 LOD를 기본으로 한다. Nanite 사용 여부는 동일 장면 A/B 측정으로 결정한다.

## 4. 콘텐츠와 아트 규격

### 4.1 월드

월드는 하나의 연결된 도로 그래프로 설계한다. 약 1~1.5 km² 안에 작은 도심, 주거지, 산업지, 고속 구간, 교차로, 주차장, 터널 **또는** 다리 1개, 짧은 외곽 도로를 포함한다. 3~5 km는 도로 중심선의 중복을 제거한 **주행 가능 경로의 합계**다. 플레이어가 도로 끝에서 막히지 않도록 순환 루프와 복귀 연결로를 둔다. 월드 경계는 보이는 장벽·지형으로 표현하고 추락 가능한 빈 공간을 남기지 않는다.

도로 표면은 Asphalt·Gravel·Grass 세 종류를 구분한다. `Physical Material` 또는 동등한 표면 식별자로 마찰·타이어 소리·파티클을 변경한다. 기본 아스팔트가 가장 높은 접지, 자갈은 중간, 잔디는 낮은 접지로 튜닝한다. 정확한 계수는 Chaos 차량 실측 튜닝 자료에 기록한다.

### 4.2 Hero Vehicle — 단일 대표 자산

가상 브랜드의 스포츠 쿠페. 아트·물리 튜닝의 **초기 가정**은 350~450 hp, 약 1,400~1,600 kg, 후륜구동, 자동변속, 목표 최고속 약 250 km/h이다. 이는 최종 라이선스 차량 스펙이 아니며 운전 감각을 맞추면서 데이터 자산에서 조정한다.

| 부분 | 최종 MVP 완료 조건 |
|---|---|
| 외관 | 자체 디자인 차체, 분리된 바퀴·타이어, 브레이크 디스크·캘리퍼, 전후등·후진등·방향지시등, 배기구, 유리, 와이퍼/미러의 시각적 형태. 추격·보닛·실내 시점에서 큰 빈틈 없음 |
| 재질 | PBR 자동차 도장(색·metallic·roughness·clear coat), 금속·고무·플라스틱·유리. 비싼 반사 효과 없이 차체 곡면이 읽히도록 조명·러프니스 튜닝 |
| 실내 | 운전석·조수석, 대시보드, 핸들, 센터 콘솔, 페달, 계기판, 기어 셀렉터, 실내/측면 미러 형상, 앞유리. Cockpit 시점에 보이는 면은 빈 메시·평면 텍스처로 대체하지 않음 |
| 상태 연동 | 바퀴 회전·조향·서스펜션, 핸들, 속도·RPM·현재 자동 기어, 브레이크등·후진등·전조등·좌우 방향지시등이 실제 차량 상태에 반응 |
| 오디오 | 아이들/저·중·고 RPM 엔진, 자동변속, 타이어 구름·슬립, 풍절음, 자갈, 충돌. RPM·스로틀·속도·표면에 따른 크로스페이드 또는 파라미터 제어 |
| 물리 | Chaos 기반 4륜, 질량·무게중심·스프링·댐퍼·타이어 접지·제동·공기 저항·엔진 토크 곡선·자동 변속·디퍼렌셜·핸드브레이크. 기어 조작 UI/키는 없음 |

엔진 물리와 애니메이션은 동일한 Chaos 차량 상태를 사용한다. 임의 속도로 바퀴와 계기판을 따로 움직이지 않는다. 차체 손상이나 분리 부품은 요구하지 않는다. 실제 후방 영상을 그리는 SceneCapture 미러는 **필수 제외**다. 미러 형상·재질은 있어야 하며, 실시간 미러를 추가하려면 Cockpit 전용 저해상도·낮은 갱신률로 별도 성능 승인 후 진행한다.

텍스처 예산 시작점: 차량 외관·실내 주요 세트는 2K 위주, 화면에서 효과가 검증된 핵심 맵만 최대 4K; 교통 차량과 주요 환경 1K~2K; 배경 소품 512~1K. 8K 텍스처는 사용하지 않는다. 압축·mipmap·texture streaming을 켜고, 메시 LOD를 추격/실내 카메라의 실제 화면 크기로 검수한다. 폴리곤·드로우콜·메모리 수치는 임시 고정값을 맹신하지 않고 측정표에 기록한다.

### 4.3 교통·레이스 차량

일반 교통 차량은 영웅 차량의 자산을 복제하지 않는다. 실루엣 2~3종과 색상 변형으로 다양성을 확보하고, 낮은 재질·애니메이션·오디오 비용을 유지한다. 레이싱 AI는 시각적으로 구별되는 3대이되, 공용 차량 베이스·바퀴/물리 데이터 구조를 재사용한다. AI 차량의 드라이빙은 허용된 거리에서 Chaos로 제어하고, 일반 교통은 §7의 등급을 따른다.

## 5. 입력, 카메라, HUD 및 메뉴

### 5.1 Enhanced Input

`IMC_Driving`과 `IMC_UI`를 분리한다. 주행 상태에서만 차량 입력을 받고, 일시정지·메뉴에서는 브레이크·조향 입력이 누적되지 않게 한다. 기본 매핑:

| 키 | 동작 |
|---|---|
| W / S | 가속 / 브레이크. 정지 후 후진은 Chaos 자동 변속 설정으로 처리 |
| A / D | 좌 / 우 조향 |
| Space | 핸드브레이크 |
| C | 4개 카메라 순환 |
| H | 전조등 토글 |
| Z / X | 좌 / 우 방향지시등 토글; 같은 키 재입력으로 해제 |
| R | 안전 위치로 차량 복구 |
| E | 레이스 마커 상호작용 |
| Esc | 일시정지/뒤로가기 |

수동 기어 업·다운 키는 만들지 않는다. 키보드에서 아날로그 축을 흉내 내기 위해 조향 입력을 시간·속도 기반으로 보간하되, 조작 지연이 과도하지 않게 튜닝한다. Gamepad 및 스티어링 휠 매핑은 없다.

### 5.2 카메라

`Chase`, `CloseChase`, `Cockpit`, `Hood` 네 시점을 구현한다. Chase는 기본 시점이며 속도에 따라 거리와 FOV가 소폭 변한다. CloseChase는 차량 가까이, Cockpit은 실제 대시보드와 핸들이 보이는 운전석, Hood는 보닛 위 전방 시점이다. 가속·제동·조향·충돌에 반응하되 과한 흔들림과 카메라 클리핑을 피한다. 카메라 전환 후 입력·HUD·차량 물리는 끊기지 않는다.

### 5.3 HUD·메뉴

HUD에는 실제 속도(km/h), RPM, 자동 기어(P/R/N/D 또는 엔진에서 제공하는 현재 기어), 미니맵, 레이스 중 순위·타이머·다음 체크포인트를 표시한다. 미니맵은 실제 도로 그래프·플레이어 위치에서 만들거나 해당 월드의 검증된 정적 맵 자산을 사용한다. 레이스 밖에서는 레이스 순위와 타이머를 숨긴다.

메인 메뉴: Play, Settings, Quit. 일시정지: Resume, Restart, Settings, Main Menu. 결과: 1~4위, 각 차량 기록 또는 미완주 표기, 자유 주행 복귀. Settings는 적어도 출력 해상도/화면 모드, Baseline·Low·High 프리셋, 화면 비율 또는 업스케일링, 음량을 제공한다. High는 기준 장비의 합격 프리셋이 아니다.

## 6. 주행 물리와 리셋

`AWheeledVehiclePawn` 기반 플레이어 차량에 정규 **Chaos Vehicles**의 `UChaosWheeledVehicleMovementComponent`를 사용하고, Skeletal Mesh·Physics Asset·Wheel Blueprint·토크 곡선·Vehicle Animation Blueprint를 연결한다. UE 5.8.x의 클래스명·프로퍼티를 확인한다. `Chaos Modular Vehicle`의 Geometry Collection/Cluster Union 방식은 사용하지 않는다. 별도의 `VehiclePhysicsComponent`로 Chaos를 중복 구현하지 않는다. `UVehiclePresentationComponent`는 조명·계기판·애니메이션·오디오의 상태 연결을 담당한다.

핵심 입력은 throttle, brake, steering, handbrake다. 자동 변속의 전진/후진 동작은 명시적으로 검증한다. 질량 이동·롤·슬립은 Chaos 설정과 물리의 자연스러운 결과로 허용한다. **전용 언더스티어/오버스티어 게임플레이 시스템은 구현하지 않는다.** 튜닝 목표는 예측 가능한 제동거리, 속도에 맞는 조향 감도, 코너링에서 차체 움직임, 고속의 안정감이다.

`R`은 직전 안전 도로 앵커를 우선 사용한다. 레이스 중이면 마지막 유효 체크포인트 뒤의 지정된 복구 위치를 사용하되 체크포인트 순서를 건너뛰지 않는다. 충돌 검사로 착지 공간을 확인하고, 속도를 0으로 초기화한 뒤 차량을 올바른 방향으로 놓는다. 플레이어·AI·교통 차량과 겹치는 위치는 거부한다. 복구 실패 시 가장 가까운 사전 등록 세이프 포인트로 폴백한다.

## 7. 도로 그래프·교통 시스템

### 7.1 도로 데이터

각 주행 차선을 방향이 있는 `ARoadLaneSpline`으로 정의한다. 차선은 고유 ID, 길이, 속도 제한, 이웃 차선, 교차로 진입/출구 연결, 정지선 위치, spawn/merge/exit 태그를 가진다. `URoadNetworkSubsystem`이 시작 시 연결성과 참조 무결성을 검사하고 런타임 조회 테이블을 만든다. 막다른 차선은 안전한 U턴 또는 생성 금지 규칙을 명시한다. 레이스 스플라인은 별도 데이터로 유지한다.

교차로는 단순한 차량 우선순위/신호 규칙으로 처리한다. 교통 신호는 `Red`, `Yellow`, `Green`과 정지선·연결 차선 집합을 갖는다. 빨간불은 정지, 노란불은 정지 가능한 거리에서 제동, 초록불은 앞차와 교차로가 비었을 때 출발한다. 정면충돌을 피하도록 상충 방향은 동시에 초록이 되지 않게 신호 계획을 검증한다.

### 7.2 교통 AI의 구현 방식

주행 AI는 **LLM, OpenAI API, 로컬 언어 모델, ML, RL을 사용하지 않는다.** 프레임마다 외부 서비스를 호출하지 않으며 NPU를 요구하지 않는다. C++ 규칙과 상태 기계가 차선 스플라인 위의 look-ahead 지점을 선택해 조향·목표 속도·브레이크를 계산한다. 가까운 차량은 제한된 전방 센서/raycast와 차선 공간 점유 데이터로 앞차·플레이어·장애물을 감지한다.

`ETrafficState`: `Cruise`, `Follow`, `ApproachLight`, `StopAtLight`, `Wait`, `ChangeLane`, `Merge`, `Recover`. 상태 전이에는 최소 거리·시간의 hysteresis를 둬 매 업데이트마다 차선 변경/정지가 흔들리지 않게 한다. 차선 유지·차간거리·신호 준수·정지 차량 회피·기본 차선 변경·고속도로 진입/출구를 지원한다. 차선 변경은 연결된 차선이 있고 전후 안전 간격이 있을 때만 허용한다. 가능한 차선이 없으면 감속·대기한다. 도시 전체의 고급 교통 법규 시뮬레이션은 범위 밖이다.

### 7.3 20대 풀과 시뮬레이션 등급

`ATrafficManager`가 생성, 재사용, 승격/강등, 폐기를 단독 관리한다. **20은 동시에 존재하는 일반 교통 차량의 최대치**이며, 레이싱 AI 3대와 플레이어는 별도다. 기준 밀도 `Medium`에서 눈에 보이는 주행 구간의 20대 상한을 향해 배치하되, 카메라 밖·안전 거리·유효한 차선 위에서만 생성한다. `Low`는 최대 10대, `High`는 최대 20대이며, Baseline 프리셋은 `High`/20대 스트레스도 검증한다.

| 등급 | 시작 거리·상한 | 물리·AI·표현 |
|---|---|---|
| Near | 플레이어 중심 대략 0~250 m, 동시에 최대 8대부터 튜닝(하드 상한 12대) | Chaos 또는 검증된 저비용 차량 물리, 충돌·센서·정상 AI 10~20 Hz, 가까운 LOD·필요한 그림자 |
| Mid | 대략 250~650 m | 스플라인 기반 단순 이동, 5~10 Hz 규칙 갱신, 낮은 LOD·그림자 최소화, 개별 오디오 없음 |
| Far | 650 m 밖 | 보이는 차량만 낮은 LOD/저빈도 이동; 비가시 차량은 풀로 반환. 700 m 밖은 원칙적으로 despawn |

거리값은 **초기값**이며 맵 굴곡·시야·GPU 프로파일에 맞춰 데이터 자산에서 조절한다. Near로 승격하기 전에 현재 위치와 속도를 보존하고, 충돌 가능한 거리에서는 스플라인 프록시를 곧바로 플레이어 앞에 순간 이동시키지 않는다. Mid/Far의 비물리 차량이 충돌할 가능성이 생기면 미리 승격하거나 안전하게 경로를 변경한다. 등급 경계에는 30~50 m 정도의 hysteresis를 둔다. 모든 차량이 매 프레임 `Tick`하지 않으며 매니저가 분산 업데이트한다. 레이스 중 교통과 레이서 3대가 함께 있는 최악 상황을 성능 시험에 포함한다.

## 8. Sprint Race와 레이싱 AI

`ARaceManager`는 `FreeDrive → Offer → Countdown → Racing → Results → FreeDrive` 상태를 관리한다. 월드의 레이스 시작 지점은 1개, 레이스 코스는 시작선·**최소 3개 체크포인트**·결승선으로 구성한다. 체크포인트는 번호 순서대로 통과해야 유효하며, 중복·역순·우회·결승선 먼저 통과는 무효다. 카운트다운 동안 차량 제어를 잠그고 `GO`에서 해제한다. 시간은 엔진의 게임 시간 또는 단조 증가 시계로 한 번만 계산하고 일시정지 시 함께 멈춘다.

`ARacingAIVehicle` 3대는 Chaos 물리 차량이며 `URacingLineData`의 위치·곡률·권장 속도를 따라간다. AI 제어는 **look-ahead 목표점 → 조향**, 현재 속도와 목표 속도 비교 → throttle/brake 순서로 수행한다. 코너 진입 전 속도를 낮추고 출구에서 가속한다. 가까운 차량·장애물의 기본 회피, 짧은 추월 시도, 코스 이탈 후 레이싱 라인 복귀를 지원한다. 추월이 안전하지 않으면 줄을 서거나 감속한다. AI가 보이지 않는 상태에서도 체크포인트·순위 계산은 동일한 규칙을 적용한다.

난이도는 `Easy`, `Normal`, `Hard` 세 데이터 설정으로 제공할 수 있다. 차이는 목표 속도 배율, 제동 여유, 가속 강도, 반응 지연, 라인 오프셋으로 제한한다. **기본 합격 경로는 Normal**이다. 3단계 UI를 넣는다면 각 난이도에서 완주 가능성을 검증한다. AI가 막히거나 전복될 때는 타임아웃 뒤 안전한 복구 지점으로 되돌려 결과 화면이 영원히 대기하지 않게 한다. 완주 순위는 결승 시각과 체크포인트 진행률로 결정한다.

## 9. 아키텍처와 C++/Blueprint 경계

C++은 상태·규칙·성능 민감 로직·데이터 검증·저장 설정을 담당한다. Blueprint는 자산 결합, 레벨 배치, VFX/오디오 이벤트, UI, 데이터 튜닝을 담당한다. 핵심 규칙을 Blueprint 그래프 곳곳에 중복하지 않는다. 데이터 자산을 바꾸지 않고도 코드에서 기본값이 검증 가능해야 하며, 누락된 에셋은 로그와 안전한 폴백으로 처리한다.

| 주요 타입(권장 이름) | 책임 | 대표 입력/출력 |
|---|---|---|
| `ARacingGameMode` / `ARacingPlayerController` | 게임 시작·플레이어 소유·메뉴 전환 | 시작 차량, 입력 컨텍스트, HUD |
| `ARacingPlayerVehicle : AWheeledVehiclePawn` | Chaos 차량, 플레이어 입력, 복구 | throttle/brake/steering, 속도·기어·RPM |
| `UVehiclePresentationComponent` | 바퀴·핸들·계기판·등화·오디오 상태 연동 | Chaos 상태 → 메시·머티리얼·사운드 |
| `UVehicleCameraComponent` | 4개 시점·카메라 보간/충돌 | 시점 ID, 속도 → 카메라 transform/FOV |
| `URoadNetworkSubsystem` / `ARoadLaneSpline` | 차선 연결·조회·유효성 검사 | 차선 ID, 거리 → 다음 차선/목표점 |
| `ATrafficManager` / `ATrafficVehicle` | 풀·거리 등급·가시성·spawn | 플레이어 위치 → 차량 집합·계층 |
| `UTrafficBrainComponent` | 교통 상태 기계와 제어 | 차선/센서/신호 → 속도·조향 |
| `ATrafficLight` / `UTrafficSignalController` | 교차로 신호 주기 | phase → 연결 차선 허가 |
| `ARaceManager` / `ARaceCheckpoint` | 레이스 상태·순서·기록·결과 | 참가/통과 이벤트 → 순위/결과 |
| `ARacingAIVehicle` / `URacingBrainComponent` | 3대 레이서 제어·복구 | 레이싱 라인 → 조향·가감속 |
| `URacingGameUserSettings` | 프리셋·출력·오디오 저장 | 설정값 → 렌더/사운드 적용 |
| `WBP_HUD`, `WBP_Menu`, `WBP_Results` | 데이터 표시와 사용자 상호작용 | 읽기 전용 게임 상태·명령 |

코드 구성 예시:

```text
RacingMVP.uproject
Config/
  DefaultEngine.ini
  DefaultGame.ini
  DefaultInput.ini
Content/RacingMVP/
  Maps/                       # L_Main, 필요 시 L_TestTrack
  Vehicles/Hero/              # SK, PA, AnimBP, Wheel BP, Materials, Audio
  Vehicles/Traffic/           # 저비용 차량 원형·색상 변형
  Roads/                      # spline/교차로/표면 에셋
  World/                      # 환경·조명·LOD·HLOD
  Race/                       # racing line, checkpoints, start marker
  Input/                      # IMC_Driving, IMC_UI, IA_*
  UI/                         # HUD/메뉴/결과
  Data/                       # Primary Data Asset/Curve/튜닝
Source/RacingMVP/
  Core/
  Vehicle/
  Camera/
  Road/
  Traffic/
  Race/
  UI/
  Performance/
Docs/
  Build.md                    # UE 버전·플러그인·패키징 방법
  ContentManifest.md          # 필요한 아트·사운드·라이선스·상태
  Profiling.md                # 재현 경로·측정 결과·변경 이력
  QA.md                       # 기능 검수 결과
```

`Config`에는 실제 검증된 기본 설정만 기록한다. 에셋 참조는 데이터 자산 또는 soft reference로 분리해 테스트 맵에서 시스템만 로드할 수 있게 한다. 로그 카테고리와 화면 밖 디버그 표시로 AI 상태, 차량 등급, 신호 상태, 체크포인트 인덱스, 풀 크기를 확인할 수 있어야 한다.

## 10. 데이터 모델과 계약

아래는 구현 의도이며 정확한 UE C++ 선언은 고정 엔진 버전의 API로 작성한다. 수치는 하드코딩하지 않고 `UPrimaryDataAsset` 또는 `UDataAsset`로 노출한다.

| 데이터 자산 | 필드·제약 |
|---|---|
| `UVehicleSpecData` | 질량(kg), 무게중심 오프셋, 토크 커브, 최댓 RPM, 자동 기어비, 최종 감속비, 브레이크/핸드브레이크 세기, 조향 감도 곡선, 타이어·서스펜션 세팅. 단위와 유효 범위 검사 |
| `URoadLaneData` | lane ID, spline 참조, 연결 lane ID 목록, speed limit(km/h), 인접 차선, stop line 거리(m), 교차로/merge/exit 플래그. 모든 연결 대상 실재 여부 검사 |
| `UTrafficTuningData` | 총량 상한, 거리 밴드/히스테리시스, 등급별 갱신 Hz, 최소 차간거리, spawn 전방/후방 거리, 신호 제동 여유, 차선 변경 쿨다운 |
| `URaceData` | 출발 transform 4개, 순서 있는 체크포인트 참조, 결승선, 레이싱 라인, AI 차량 데이터 3개, 난이도 배율, 회복 타임아웃. 출발 transform 겹침 검사 |
| `URacingLineData` | 거리 증가 순서의 spline 샘플, 권장 속도(km/h), 코너/추월 허용 여부. 0길이·불연속 샘플 검사 |
| `USurfaceTuningData` | Asphalt/Gravel/Grass별 마찰 보정, 타이어·자갈 오디오와 VFX 참조 |
| `UGraphicsPresetData` | output, 내부 화면 비율, TSR, 시야/그림자/텍스처/효과/반사/식생 품질, 교통 상한. Baseline은 20대 스트레스 검증 구성 |

런타임 이벤트는 `OnVehicleTelemetryChanged`, `OnTrafficTierChanged`, `OnTrafficLightPhaseChanged`, `OnCheckpointPassed`, `OnRaceStateChanged`, `OnRaceFinished` 정도로 한정한다. HUD는 이벤트 또는 낮은 갱신률의 읽기 전용 폴링을 사용한다. 매 프레임 UMG 전체를 재구성하지 않는다.

## 11. 성능 예산과 최적화 순서

60 FPS의 총 프레임 예산은 **16.67 ms**다. CPU와 GPU 시간은 서로 더한 값이 아니라 병렬 병목으로 관찰한다. 다음은 첫 번째 프로파일링에 사용할 **목표 상한**이며 측정 결과에 맞춰 재배분한다.

| 지표 | 초깃값/목표 | 확인 방법 |
|---|---|---|
| GPU 프레임 시간 | 평균 ≤ 14 ms, 스트레스 구간의 대부분 ≤ 16.67 ms | 패키지 빌드 GPU 프로파일/`stat gpu` |
| Game Thread | 평균 ≤ 8 ms | `stat unit`, Unreal Insights |
| Render Thread | 평균 ≤ 8 ms | `stat unit`, Unreal Insights |
| 교통 규칙 업데이트 | 평균 ≤ 1.5 ms | Insights 범위 계측; 20대 스트레스 |
| 프레임레이트 | 10분 측정 평균 ≥ 60 FPS 목표, 1% low ≥ 45 FPS, 30 FPS 미만 5초 연속 없음 | 프레임 시간 CSV의 재현 가능한 분석 |
| 교통 차량 | 최대 20대, Near 8부터 시작·최대 12대, Racing AI 3대 | 화면 디버그/로그 |
| 메모리 | 16 GB 공유 메모리 장비에서 OOM·지속적 page thrash·텍스처 스트리밍 누락 없음 | 시스템 메모리, `stat memory`, streaming 진단 |

메모리 16 GB는 CPU와 iGPU가 공유한다. 단순히 `VRAM 8 GB`를 별도로 가정하지 않는다. 시스템 여유 메모리를 보면서 texture pool 크기와 lightmap 해상도를 조정한다. 고해상도 텍스처는 화면에서 효과가 입증된 곳에만 남긴다.

성능이 부족할 때 조정 순서: (1) 화면 비율을 83%에서 75%, 필요 시 67%로 내리고 TSR 화질 확인 → (2) 그림자 거리·동적 광원·반사/포스트 효과 축소 → (3) 교통 Near 상한/AI 갱신률·가시 차량 분포 조절(총 상한 20은 유지) → (4) 식생·환경 밀도/LOD/HLOD·드로우콜 조정 → (5) 텍스처·라이트맵 예산 조정. 각 변경 전후의 동일 경로 측정값과 화면 스크린샷을 남긴다. 기능을 숨기거나 AI 차량 수를 몰래 줄여 합격 처리하지 않는다.

## 12. 구현 단계와 단계별 출구 조건

| 단계 | 구현 작업 | 종료 조건 |
|---|---|---|
| P0 프로젝트 골격 | UE 5.8.x 패치 버전 고정, production Chaos Vehicles/Enhanced Input 설정, Experimental Chaos Modular Vehicle 비활성 검수, 패키징, 기본 테스트 맵, 데이터 자산 스키마, 로깅 | 빈 프로젝트 Windows Development 빌드가 실행되고 정규 Chaos 차량 프록시가 생성됨 |
| P1 차량 프로토타입 | Chaos 차량·자동 변속·키보드·4시점·기본 주행 테스트 코스 | 주행·제동·후진·핸드브레이크·리셋이 반복 재현되고 차량 상태값을 읽을 수 있음 |
| P2 Hero Vehicle | 최종 외관/실내 자산 통합, 바퀴/서스펜션/핸들/계기판/등화/오디오, 표면별 반응 | 4시점에서 자산 결함 없이 모든 기능이 실제 상태와 연동됨. 16 GB 장비에서 메모리 스트리밍 문제 없음 |
| P3 월드·도로 | 1~1.5 km², 3~5 km 연결 도로, 차선 그래프·신호등·고정 조명, 미니맵 | 주요 구역을 끊김 없이 왕복 가능하고 차선 참조·신호 상충 검사가 통과함 |
| P4 교통 | 20대 풀, 상태 기계, 차간거리·신호·차선 변경·merge/exit, 거리 등급 | 고정 경로 10분 동안 20대 상한·충돌/교착/팝인 검사 통과. 성능 게이트 측정 기록 |
| P5 레이스 | Sprint, 체크포인트, AI 3대, 순위/타이머, 결과·복귀 | 플레이어 승/패, AI 미완주, 재시작·일시정지 흐름 모두 완료 가능 |
| P6 성능·폴리시 | Baseline·Low 프리셋, A/B 프로파일링, LOD/조명/오디오·UI 정리, 패키지 QA | §13·§14 합격 조건을 기준 장비의 패키지 빌드에서 충족하고 증거 보존 |

매 단계는 `Docs/QA.md`의 해당 체크리스트와 `Docs/Profiling.md`의 기준 장비 측정값을 갱신해야 끝난다. Codex가 코드만 생성하고 UE 에셋/맵을 자동 생성할 수 없는 환경이라면, 단계 산출물에 **에디터에서 생성할 에셋 이름·부모 클래스·설정·참조 연결 절차**를 빠짐없이 기록하고 미완료 상태를 명시한다. 임시 자산 단계와 최종 아트 통합 단계를 혼동하지 않는다.

## 13. 테스트 계획과 성능 측정 프로토콜

### 13.1 기능 테스트

- **차량:** 정지→가속→자동 변속→제동→후진, 핸드브레이크, Asphalt/Gravel/Grass 비교, 전복·복구, 4시점 전환, HUD/대시보드/등화/오디오 상태 일치.
- **도로·교통:** 차선 그래프 연결성, 양방향 차선 구분, 빨강/노랑/초록 신호, 앞차 추종, 플레이어 끼어들기, 정지 차량 회피, 안전한 차선 변경, merge/exit, 20대 풀의 반복 spawn/despawn과 tier 전환. 레이스와 교통을 동시에 실행.
- **레이스:** 순서대로 체크포인트 통과, 체크포인트 건너뛰기 차단, 역주행, 플레이어와 AI 3대의 순위·동점 처리, 일시정지/재시작, AI 전복·복구, 결과→자유 주행 복귀.
- **UI/빌드:** 메뉴·그래픽 설정 저장/재실행 복구, 입력 컨텍스트 전환, 패키지 빌드에서 누락 에셋·크래시·로그 오류 검사. 네트워크 없이 전체 플레이 가능.

단위 테스트는 도로 그래프 유효성, 체크포인트 순서, 순위 계산, 신호 phase 충돌 방지, AI 상태 전이를 대상으로 한다. 물리 감각과 시각 품질은 자동 테스트만으로 판정하지 않고 실제 패키지 플레이와 기록 영상으로 확인한다.

### 13.2 성능 테스트

동일한 **Core Ultra 5 125H + 7 Xe-core Arc + 16 GB 듀얼채널** 장비, AC 전원, 일정한 Windows 전원 모드, 기록된 Intel 그래픽 드라이버 버전, 백그라운드 앱 최소화 상태에서 측정한다. 패키지된 Windows 빌드의 1920×1080 출력, Baseline 프리셋, VSync/프레임 제한 상태를 고정하고 **워밍업 3분 + 측정 10분**을 수행한다. 측정 전후 온도·전력 제한/스로틀링 여부를 기록한다.

재현 경로 3개: A) 도심과 신호 교차로를 포함한 자유 주행, 교통 20대 상한; B) 고속 도로·터널/다리를 지나 네 시점 모두 전환하는 경로; C) **교통 20대 상한 + 레이싱 AI 3대 + 플레이어**가 동시 존재하는 레이스 경로. 각 경로를 최소 3회 실행하고 중간값과 최악값을 기록한다. 프레임 시간 CSV에서 평균 FPS, 1% low(느린 1% 프레임 시간의 역수), 30 FPS 미만 연속 구간, GPU/Game/Render thread 병목을 계산한다. `stat unit`, `stat gpu`, Unreal Insights는 원인 분석에 사용하고, 계측 오버헤드가 있으면 별도 실행으로 프레임레이트를 다시 측정한다.

**합격 판정:** A/B/C 각각 10분 측정 3회의 중간값이 평균 ≥ 60 FPS, 1% low ≥ 45 FPS, 30 FPS 미만 연속 구간 < 5초. 결과는 실제 숫자·빌드 ID·프리셋·화면 비율과 함께 문서에 기록한다. 이 기준을 충족하지 않으면 성능 항목은 미완료로 남긴다. 하드웨어가 없거나 Windows 패키지를 실행할 수 없다면 테스트를 `미검증`으로 표시하며 60 FPS 달성을 주장하지 않는다.

## 14. 최종 Acceptance Criteria

모든 항목은 **Windows 패키지 빌드**에서 검증한다. 체크박스를 닫을 때 관련 테스트 증거(로그, 스크린샷, 영상, 성능 CSV)를 `Docs/QA.md`에 연결한다.

- [ ] 고정된 **Unreal Engine 5.8.x** 패치 버전에서 프로젝트가 빌드·패키징되고 오프라인으로 실행된다.
- [ ] Hero Vehicle과 근거리 물리 차량이 production Chaos Vehicles를 사용하며, `.uproject`·모듈·에셋에 **Experimental Chaos Modular Vehicle** 의존성이 없다.
- [ ] 플레이어 차량 1대의 고품질 외관·실내, 4륜/서스펜션/핸들, 계기판, 전조·브레이크·후진·방향지시등, 엔진·타이어·풍절음이 실제 상태에 연동된다.
- [ ] Chaos 기반 자동 변속 차량의 가속·제동·조향·핸드브레이크·후진·전복 복구가 작동한다. 수동 기어 키나 UI는 없다.
- [ ] Chase, CloseChase, Cockpit, Hood 네 시점이 카메라 클리핑/심한 멀미 유발 흔들림 없이 전환된다.
- [ ] 약 1~1.5 km²의 플레이 가능 월드와 연결된 총 3~5 km 도로에서 도심·주거·산업·고속 구간·주차장·터널 또는 다리·외곽 구간을 주행할 수 있다.
- [ ] Asphalt/Gravel/Grass의 주행 반응과 오디오 차이가 확인된다.
- [ ] 일반 교통 최대 20대가 차선, 차간거리, 교통 신호, 교차로, 기본 차선 변경/진출입을 따르고, 거리 기반 등급과 안전한 spawn/despawn이 작동한다.
- [ ] 교통과 레이스 주행 AI가 자체 규칙·상태 기계·스플라인으로 동작하고 네트워크/LLM/ML/RL/NPU에 의존하지 않는다.
- [ ] Sprint Race 1개에 레이싱 AI 3대가 참가하며 카운트다운, 체크포인트 순서, 타이머, 순위, 결과, 자유 주행 복귀가 작동한다.
- [ ] 실제 차량 상태의 속도·RPM·기어, 미니맵, 레이스 순위·타이머가 표시된다. 메인·일시정지·설정·결과 메뉴가 작동한다.
- [ ] 1920×1080 출력, Lumen 기본 OFF, ray tracing OFF, 정적/베이크 환경 조명, selective Nanite 원칙과 TSR/내부 해상도 설정이 검증된다.
- [ ] §13의 성능 측정이 기준 장비에서 평균 60 FPS, 1% low 45 FPS, 30 FPS 미만 연속 5초 없음 기준을 충족한다.
- [ ] 콘텐츠 라이선스·최종 아트 상태, 빌드 절차, 기능 QA, 성능 측정값이 문서화되어 있다.

## 15. 제외 범위와 변경 관리

MVP에는 다음을 넣지 않는다: 여러 플레이어 차량, 차량 구매·차고·경제·커리어, 차량 커스터마이징/고급 튜닝, 라이선스된 실차 복제, 풀 차량 손상·차체 변형, 보행자·경찰·추격, 멀티플레이/온라인 레이스, 수백 대 교통, 대형 100 km² 월드, 수동 기어 변경, **별도 언더스티어/오버스티어 기능**, Gamepad/스티어링 휠, 태양 회전·하늘 전환·주야 순환·동적 날씨/비/눈, 필수 실시간 미러, Lumen/하드웨어 레이 트레이싱 의존, LLM/ML/RL 운전 AI, **Experimental Chaos Modular Vehicle**. 차량 물리에서 자연히 나타나는 슬립·하중 이동 자체를 제거한다는 의미는 아니다.

새 기능을 제안할 때에는 이 문서의 목표 장비·성능·완료 조건에 미치는 영향, 추가 자산, 검증 비용을 먼저 기록한다. 합격 범위를 조용히 바꾸지 않는다.

## 16. 구현 참고 문서

아래는 설계·설정 확인용 공식 문서다. 실제 구현 시 고정한 UE5 버전의 해당 페이지로 API를 다시 확인한다.

- [Epic: Chaos Vehicles 및 차량 설정](https://dev.epicgames.com/documentation/unreal-engine/how-to-set-up-vehicles-in-unreal-engine) — Chaos 차량의 필수 에셋·플러그인 구성.
- [Epic: Unreal Engine 5.8 Release Notes](https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes?lang=en-US) — 엔진 버전 기준.
- [Epic: Chaos Modular Vehicle 플러그인 API](https://dev.epicgames.com/documentation/unreal-engine/API/PluginIndex/ChaosModularVehicle) — Experimental 플러그인임을 확인하고 프로젝트에서 제외.
- [Epic: Enhanced Input](https://dev.epicgames.com/documentation/en-us/unreal-engine/enhanced-input-in-unreal-engine) — Input Action과 Mapping Context.
- [Epic: Temporal Upscalers](https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-upscalers-in-unreal-engine) — TSR과 내부 화면 비율 제어.
- [Epic: Dynamic Resolution](https://dev.epicgames.com/documentation/en-us/unreal-engine/dynamic-resolution-in-unreal-engine) 및 [TSR FAQ](https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-frequently-asked-questions-for-unreal-engine) — 동적 해상도 지원·플랫폼 제약을 고정 버전에서 재확인.
- [Epic: Global Illumination](https://dev.epicgames.com/documentation/en-us/unreal-engine/global-illumination-in-unreal-engine) 및 [Static Light Mobility](https://dev.epicgames.com/documentation/en-us/unreal-engine/static-light-mobility-in-unreal-engine) — 정적/베이크 조명.
- [Epic: Performance Profiling](https://dev.epicgames.com/documentation/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine) 및 [Stat Commands](https://dev.epicgames.com/documentation/unreal-engine/stat-commands-in-unreal-engine) — 병목 측정과 로그.
