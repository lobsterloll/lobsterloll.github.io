#include "Vehicle/RacingPlayerVehicle.h"
#include "Vehicle/RacingWheels.h"
#include "Vehicle/VehiclePresentationComponent.h"
#include "Core/RacingGameMode.h"
#include "Race/RaceManager.h"
#include "RacingMVP.h"
#include "Camera/CameraComponent.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/AudioComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputCoreTypes.h"
#include "InputMappingContext.h"
#include "UObject/ConstructorHelpers.h"
#include "Animation/AnimInstance.h"
#include "Sound/SoundBase.h"

ARacingPlayerVehicle::ARacingPlayerVehicle(const FObjectInitializer& ObjectInitializer) : Super(ObjectInitializer)
{
    PrimaryActorTick.bCanEverTick = true;
    AutoPossessPlayer = EAutoReceiveInput::Player0;
    static ConstructorHelpers::FObjectFinder<USkeletalMesh> CarMesh(TEXT("/Game/Vehicles/SportsCar/SKM_SportsCar.SKM_SportsCar"));
    if (CarMesh.Succeeded()) GetMesh()->SetSkeletalMesh(CarMesh.Object);
    static ConstructorHelpers::FClassFinder<UAnimInstance> VehicleAnimation(TEXT("/Game/Vehicles/SportsCar/ABP_SportsCar"));
    if (VehicleAnimation.Succeeded()) GetMesh()->SetAnimInstanceClass(VehicleAnimation.Class);
    GetMesh()->SetCollisionProfileName(TEXT("Vehicle"));
    GetMesh()->SetSimulatePhysics(true);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Blue(TEXT("/Game/RacingMVP/Materials/M_P0VehicleBlue.M_P0VehicleBlue"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Dark(TEXT("/Game/RacingMVP/Materials/M_P0VehicleDark.M_P0VehicleDark"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Glass(TEXT("/Game/RacingMVP/Materials/M_P0VehicleGlass.M_P0VehicleGlass"));
    auto ConfigureProxy = [this](UStaticMeshComponent* Part, UStaticMesh* Shape, UMaterialInterface* Paint,
        const FVector& Position, const FVector& Scale, const FRotator& Rotation = FRotator::ZeroRotator)
    {
        Part->SetupAttachment(GetMesh());
        Part->SetStaticMesh(Shape);
        Part->SetMaterial(0, Paint);
        Part->SetRelativeLocation(Position);
        Part->SetRelativeRotation(Rotation);
        Part->SetRelativeScale3D(Scale);
        Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Part->SetVisibility(false);
        P0ProxyParts.Add(Part);
    };
    ConfigureProxy(CreateDefaultSubobject<UStaticMeshComponent>(TEXT("P0CarBody")), Cube.Object, Blue.Object,
        FVector(0, 0, 70), FVector(4.0, 1.8, 0.55));
    ConfigureProxy(CreateDefaultSubobject<UStaticMeshComponent>(TEXT("P0CarCabin")), Cube.Object, Glass.Object,
        FVector(-30, 0, 122), FVector(1.8, 1.45, 0.62));
    const FVector WheelPositions[] = {
        FVector(125, -96, 40), FVector(125, 96, 40),
        FVector(-125, -96, 40), FVector(-125, 96, 40)
    };
    const FName WheelNames[] = {TEXT("P0WheelFL"), TEXT("P0WheelFR"), TEXT("P0WheelRL"), TEXT("P0WheelRR")};
    for (int32 Index = 0; Index < 4; ++Index)
    {
        ConfigureProxy(CreateDefaultSubobject<UStaticMeshComponent>(WheelNames[Index]), Cylinder.Object, Dark.Object,
            WheelPositions[Index], FVector(0.8, 0.8, 0.28), FRotator(0, 0, 90));
    }

    Presentation = CreateDefaultSubobject<UVehiclePresentationComponent>(TEXT("VehiclePresentation"));
    auto* HeadLeft = CreateDefaultSubobject<USpotLightComponent>(TEXT("HeadlightLeft"));
    HeadLeft->SetupAttachment(GetMesh());
    HeadLeft->SetRelativeLocation(FVector(185, -70, 70));
    HeadLeft->SetIntensity(7000.0f);
    HeadLeft->SetAttenuationRadius(1100.0f);
    HeadLeft->SetVisibility(false);
    auto* HeadRight = CreateDefaultSubobject<USpotLightComponent>(TEXT("HeadlightRight"));
    HeadRight->SetupAttachment(GetMesh());
    HeadRight->SetRelativeLocation(FVector(185, 70, 70));
    HeadRight->SetIntensity(7000.0f);
    HeadRight->SetAttenuationRadius(1100.0f);
    HeadRight->SetVisibility(false);
    auto* BrakeLeft = CreateDefaultSubobject<UPointLightComponent>(TEXT("BrakeLightLeft"));
    BrakeLeft->SetupAttachment(GetMesh());
    BrakeLeft->SetRelativeLocation(FVector(-180, -65, 75));
    BrakeLeft->SetLightColor(FLinearColor::Red);
    BrakeLeft->SetIntensity(180.0f);
    BrakeLeft->SetAttenuationRadius(200.0f);
    BrakeLeft->SetVisibility(false);
    auto* BrakeRight = CreateDefaultSubobject<UPointLightComponent>(TEXT("BrakeLightRight"));
    BrakeRight->SetupAttachment(GetMesh());
    BrakeRight->SetRelativeLocation(FVector(-180, 65, 75));
    BrakeRight->SetLightColor(FLinearColor::Red);
    BrakeRight->SetIntensity(180.0f);
    BrakeRight->SetAttenuationRadius(200.0f);
    BrakeRight->SetVisibility(false);
    auto* Reverse = CreateDefaultSubobject<UPointLightComponent>(TEXT("ReverseLight"));
    Reverse->SetupAttachment(GetMesh());
    Reverse->SetRelativeLocation(FVector(-180, 0, 72));
    Reverse->SetIntensity(140.0f);
    Reverse->SetAttenuationRadius(170.0f);
    Reverse->SetVisibility(false);
    auto* SignalLeft = CreateDefaultSubobject<UPointLightComponent>(TEXT("SignalLeft"));
    SignalLeft->SetupAttachment(GetMesh());
    SignalLeft->SetRelativeLocation(FVector(-180, -85, 76));
    SignalLeft->SetLightColor(FLinearColor(1.0f, 0.35f, 0.0f));
    SignalLeft->SetIntensity(140.0f);
    SignalLeft->SetAttenuationRadius(170.0f);
    SignalLeft->SetVisibility(false);
    auto* SignalRight = CreateDefaultSubobject<UPointLightComponent>(TEXT("SignalRight"));
    SignalRight->SetupAttachment(GetMesh());
    SignalRight->SetRelativeLocation(FVector(-180, 85, 76));
    SignalRight->SetLightColor(FLinearColor(1.0f, 0.35f, 0.0f));
    SignalRight->SetIntensity(140.0f);
    SignalRight->SetAttenuationRadius(170.0f);
    SignalRight->SetVisibility(false);
    Presentation->SetLights(HeadLeft, HeadRight, BrakeLeft, BrakeRight, Reverse, SignalLeft, SignalRight);

    static ConstructorHelpers::FObjectFinder<USoundBase> EngineLoop(TEXT("/Game/RacingMVP/Audio/SW_EngineLoop.SW_EngineLoop"));
    static ConstructorHelpers::FObjectFinder<USoundBase> TireLoop(TEXT("/Game/RacingMVP/Audio/SW_TireLoop.SW_TireLoop"));
    static ConstructorHelpers::FObjectFinder<USoundBase> WindLoop(TEXT("/Game/RacingMVP/Audio/SW_WindLoop.SW_WindLoop"));
    static ConstructorHelpers::FObjectFinder<USoundBase> GravelLoop(TEXT("/Game/RacingMVP/Audio/SW_GravelLoop.SW_GravelLoop"));
    EngineAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("EngineAudio"));
    EngineAudio->SetupAttachment(GetMesh());
    EngineAudio->SetSound(EngineLoop.Object);
    EngineAudio->bAutoActivate = false;
    TireAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("TireAudio"));
    TireAudio->SetupAttachment(GetMesh());
    TireAudio->SetSound(TireLoop.Object);
    TireAudio->bAutoActivate = false;
    WindAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("WindAudio"));
    WindAudio->SetupAttachment(GetMesh());
    WindAudio->SetSound(WindLoop.Object);
    WindAudio->bAutoActivate = false;
    GravelAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("GravelAudio"));
    GravelAudio->SetupAttachment(GetMesh());
    GravelAudio->SetSound(GravelLoop.Object);
    GravelAudio->bAutoActivate = false;

    CameraArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
    CameraArm->SetupAttachment(GetMesh());
    CameraArm->TargetArmLength = 800.0f;
    CameraArm->SetRelativeLocation(FVector(0, 0, 285));
    CameraArm->SetRelativeRotation(FRotator(-23, 0, 0));
    CameraArm->bDoCollisionTest = true;
    CameraArm->bInheritPitch = false;
    CameraArm->bInheritRoll = false;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("DrivingCamera"));
    Camera->SetupAttachment(CameraArm, USpringArmComponent::SocketName);
    Camera->FieldOfView = 80.0f;


    if (UChaosWheeledVehicleMovementComponent* Chaos = GetChaosMovement())
    {
        Chaos->SetIsReplicated(false);
        Chaos->Mass = 1500.0f;
        Chaos->bEnableCenterOfMassOverride = true;
        Chaos->CenterOfMassOverride = FVector(0, 0, -35);
        Chaos->ChassisHeight = 144.0f;
        Chaos->DragCoefficient = 0.31f;
        Chaos->bLegacyWheelFrictionPosition = true;
        Chaos->WheelSetups.SetNum(4);
        const FName Bones[] = {TEXT("Phys_Wheel_FL"), TEXT("Phys_Wheel_FR"), TEXT("Phys_Wheel_BL"), TEXT("Phys_Wheel_BR")};
        for (int32 Index = 0; Index < 4; ++Index)
        {
            Chaos->WheelSetups[Index].WheelClass = Index < 2 ? URacingFrontWheel::StaticClass() : URacingRearWheel::StaticClass();
            Chaos->WheelSetups[Index].BoneName = Bones[Index];
        }
        Chaos->EngineSetup.MaxTorque = 750.0f;
        Chaos->EngineSetup.MaxRPM = 7000.0f;
        Chaos->EngineSetup.EngineIdleRPM = 900.0f;
        Chaos->EngineSetup.EngineBrakeEffect = 0.2f;
        Chaos->EngineSetup.EngineRevUpMOI = 5.0f;
        Chaos->EngineSetup.EngineRevDownRate = 600.0f;
        FRichCurve* Torque = Chaos->EngineSetup.TorqueCurve.GetRichCurve();
        Torque->AddKey(0, 0.55f);
        Torque->AddKey(1000, 0.7f);
        Torque->AddKey(3500, 1.0f);
        Torque->AddKey(6500, 0.8f);
        Torque->AddKey(7000, 0.5f);
        Chaos->TransmissionSetup.bUseAutomaticGears = true;
        Chaos->TransmissionSetup.bUseAutoReverse = true;
        Chaos->TransmissionSetup.FinalRatio = 2.81f;
        Chaos->TransmissionSetup.ChangeUpRPM = 6000.0f;
        Chaos->TransmissionSetup.ChangeDownRPM = 2000.0f;
        Chaos->TransmissionSetup.GearChangeTime = 0.2f;
        Chaos->TransmissionSetup.TransmissionEfficiency = 0.9f;
        Chaos->TransmissionSetup.ForwardGearRatios = {4.25f, 2.52f, 1.66f, 1.22f, 1.0f};
        Chaos->TransmissionSetup.ReverseGearRatios = {4.04f};
        Chaos->SteeringSetup.SteeringType = ESteeringType::Ackermann;
        Chaos->SteeringSetup.AngleRatio = 0.7f;
        Chaos->DifferentialSetup.DifferentialType = EVehicleDifferential::RearWheelDrive;
    }
}

UChaosWheeledVehicleMovementComponent* ARacingPlayerVehicle::GetChaosMovement() const
{
    return Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent());
}

void ARacingPlayerVehicle::BeginPlay()
{
    Super::BeginPlay();
    ResetTransform = GetActorTransform();
    const FString MapName = GetWorld() ? GetWorld()->GetMapName() : FString();
    const bool bProxyMap = MapName.Contains(TEXT("L_P0Test")) || MapName.Contains(TEXT("L_P2VehicleTest"))
        || MapName.Contains(TEXT("L_P3TorontoCity")) || MapName.Contains(TEXT("L_OpenWorldDrive"))
        || MapName.Contains(TEXT("L_CityShell"));
    for (UStaticMeshComponent* Part : P0ProxyParts) if (Part) Part->SetVisibility(bProxyMap);
    UE_LOG(LogRacingMVP, Display, TEXT("Vehicle proxy visual=%s map=%s parts=%d mesh_visible=%d"),
        bProxyMap ? TEXT("visible") : TEXT("hidden"), *MapName, P0ProxyParts.Num(), GetMesh()->IsVisible());
    if (UChaosWheeledVehicleMovementComponent* Chaos = GetChaosMovement()) Chaos->SetUseAutomaticGears(true);
    if (EngineAudio && EngineAudio->Sound) EngineAudio->Play();
    if (TireAudio && TireAudio->Sound) TireAudio->Play();
    if (WindAudio && WindAudio->Sound) WindAudio->Play();
    if (GravelAudio && GravelAudio->Sound) GravelAudio->Play();
    UE_LOG(LogRacingMVP, Display, TEXT("P1 Chaos car spawned: mesh=%s wheels=4 automatic=1"), *GetNameSafe(GetMesh()->GetSkeletalMeshAsset()));
}

void ARacingPlayerVehicle::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    UChaosWheeledVehicleMovementComponent* Chaos = GetChaosMovement();
    if (!Chaos) return;
    const float AppliedThrottle = bRaceControlLocked ? 0.0f : (bRaceAI ? RaceAIThrottle : (bThrottleHeld ? 1.0f : 0.0f));
    const float AppliedBrake = bRaceControlLocked ? 0.0f : (bRaceAI ? RaceAIBrake : (bBrakeHeld ? 1.0f : 0.0f));
    Chaos->SetThrottleInput(AppliedThrottle);
    Chaos->SetBrakeInput(AppliedBrake);
    Chaos->SetHandbrakeInput(bRaceControlLocked || (!bRaceAI && bHandbrakeHeld));
    const float SpeedKmh = FMath::Abs(Chaos->GetForwardSpeed()) * 0.036f;
    const float SteeringScale = FMath::GetMappedRangeValueClamped(FVector2D(0, 140), FVector2D(1.0f, 0.45f), SpeedKmh);
    const float TargetSteering = bRaceControlLocked ? 0.0f :
        (bRaceAI ? RaceAISteering : ((bRightHeld ? 1.0f : 0.0f) - (bLeftHeld ? 1.0f : 0.0f))) * SteeringScale;
    SmoothedSteering = FMath::FInterpTo(SmoothedSteering, TargetSteering, DeltaSeconds, 5.0f);
    Chaos->SetSteeringInput(SmoothedSteering);
    Presentation->UpdateFromVehicle(Chaos, AppliedThrottle,
        AppliedBrake, SmoothedSteering, !bRaceAI && bHandbrakeHeld,
        bHeadlightsOn, bLeftIndicatorOn, bRightIndicatorOn);
    const FRacingVehicleState& VehicleState = Presentation->State;
    if (EngineAudio)
    {
        EngineAudio->SetPitchMultiplier(FMath::GetMappedRangeValueClamped(FVector2D(900, 7000), FVector2D(0.75f, 1.55f), VehicleState.EngineRPM));
        EngineAudio->SetVolumeMultiplier(0.22f + 0.28f * AppliedThrottle);
    }
    if (TireAudio) TireAudio->SetVolumeMultiplier(FMath::Clamp((FMath::Abs(SpeedKmh) / 160.0f) * (0.15f + VehicleState.WheelSlip), 0.0f, 0.75f));
    if (WindAudio) WindAudio->SetVolumeMultiplier(FMath::GetMappedRangeValueClamped(FVector2D(0, 180), FVector2D(0.0f, 0.6f), FMath::Abs(SpeedKmh)));
    if (GravelAudio) GravelAudio->SetVolumeMultiplier(VehicleState.Surface.GetValue() == SurfaceType2 ? FMath::Clamp(FMath::Abs(SpeedKmh) / 90.0f, 0.0f, 0.55f) : 0.0f);

    if (bRaceAI) return;

    FVector CameraPosition(0, 0, 285);
    float ArmLength = 800.0f;
    float Fov = 80.0f;
    float CameraPitch = -23.0f;
    switch (CameraMode)
    {
    case ERacingCameraMode::CloseChase: CameraPosition = FVector(0, 0, 235); ArmLength = 500; Fov = 85; CameraPitch = -16.0f; break;
    case ERacingCameraMode::Cockpit: CameraPosition = FVector(35, -32, 110); ArmLength = 0; Fov = 80; CameraPitch = 0.0f; break;
    case ERacingCameraMode::Hood: CameraPosition = FVector(185, 0, 108); ArmLength = 0; Fov = 85; CameraPitch = -3.0f; break;
    default: break;
    }
    if (CameraMode == ERacingCameraMode::Chase)
    {
        ArmLength += FMath::Clamp(SpeedKmh, 0.0f, 140.0f) * 0.5f;
        Fov += FMath::Clamp(SpeedKmh, 0.0f, 140.0f) * 0.03f;
    }
    CameraArm->bDoCollisionTest = ArmLength > 0;
    CameraArm->TargetArmLength = FMath::FInterpTo(CameraArm->TargetArmLength, ArmLength, DeltaSeconds, 7);
    CameraArm->SetRelativeLocation(FMath::VInterpTo(CameraArm->GetRelativeLocation(), CameraPosition, DeltaSeconds, 7));
    CameraArm->SetRelativeRotation(FMath::RInterpTo(CameraArm->GetRelativeRotation(), FRotator(CameraPitch, 0.0f, 0.0f), DeltaSeconds, 7.0f));
    Camera->SetFieldOfView(FMath::FInterpTo(Camera->FieldOfView, Fov, DeltaSeconds, 7));

    TelemetryClock += DeltaSeconds;
    if (TelemetryClock >= 2.0f)
    {
        TelemetryClock = 0;
        UE_LOG(LogRacingMVP, Display, TEXT("P1 telemetry speed_kmh=%.1f gear=%d throttle=%d brake=%d steer=%.2f handbrake=%d camera=%d"),
            Chaos->GetForwardSpeed() * 0.036f, Chaos->GetCurrentGear(), bThrottleHeld, bBrakeHeld, SmoothedSteering, bHandbrakeHeld, static_cast<int32>(CameraMode));
    }
}

void ARacingPlayerVehicle::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    UEnhancedInputComponent* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent);
    APlayerController* PC = Cast<APlayerController>(GetController());
    UEnhancedInputLocalPlayerSubsystem* Subsystem = PC && PC->GetLocalPlayer()
        ? ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()) : nullptr;
    if (!Input || !Subsystem)
    {
        UE_LOG(LogRacingMVP, Error, TEXT("P1 Enhanced Input unavailable"));
        return;
    }
    DrivingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_Driving"));
    UIContext = NewObject<UInputMappingContext>(this, TEXT("IMC_UI"));
    auto MakeAction = [this](const TCHAR* Name) -> UInputAction*
    {
        UInputAction* Action = NewObject<UInputAction>(this, Name);
        Action->ValueType = EInputActionValueType::Boolean;
        InputActions.Add(Action);
        return Action;
    };
    UInputAction* Throttle = MakeAction(TEXT("IA_Throttle"));
    UInputAction* Brake = MakeAction(TEXT("IA_BrakeReverse"));
    UInputAction* Left = MakeAction(TEXT("IA_SteerLeft"));
    UInputAction* Right = MakeAction(TEXT("IA_SteerRight"));
    UInputAction* Handbrake = MakeAction(TEXT("IA_Handbrake"));
    UInputAction* CameraAction = MakeAction(TEXT("IA_Camera"));
    UInputAction* Reset = MakeAction(TEXT("IA_Reset"));
    UInputAction* Headlights = MakeAction(TEXT("IA_Headlights"));
    UInputAction* LeftSignal = MakeAction(TEXT("IA_LeftSignal"));
    UInputAction* RightSignal = MakeAction(TEXT("IA_RightSignal"));
    UInputAction* Interact = MakeAction(TEXT("IA_RaceInteract"));
    UInputAction* Pause = MakeAction(TEXT("IA_RacePause"));
    UInputAction* Restart = MakeAction(TEXT("IA_RaceRestart"));
    UInputAction* Leave = MakeAction(TEXT("IA_RaceLeave"));
    DrivingContext->MapKey(Throttle, EKeys::W);
    DrivingContext->MapKey(Brake, EKeys::S);
    DrivingContext->MapKey(Left, EKeys::A);
    DrivingContext->MapKey(Right, EKeys::D);
    DrivingContext->MapKey(Handbrake, EKeys::SpaceBar);
    DrivingContext->MapKey(CameraAction, EKeys::C);
    DrivingContext->MapKey(Reset, EKeys::R);
    DrivingContext->MapKey(Headlights, EKeys::H);
    DrivingContext->MapKey(LeftSignal, EKeys::Z);
    DrivingContext->MapKey(RightSignal, EKeys::X);
    DrivingContext->MapKey(Interact, EKeys::E);
    DrivingContext->MapKey(Pause, EKeys::Escape);
    DrivingContext->MapKey(Restart, EKeys::T);
    DrivingContext->MapKey(Leave, EKeys::M);
    Input->BindAction(Throttle, ETriggerEvent::Started, this, &ARacingPlayerVehicle::ThrottlePressed);
    Input->BindAction(Throttle, ETriggerEvent::Completed, this, &ARacingPlayerVehicle::ThrottleReleased);
    Input->BindAction(Brake, ETriggerEvent::Started, this, &ARacingPlayerVehicle::BrakePressed);
    Input->BindAction(Brake, ETriggerEvent::Completed, this, &ARacingPlayerVehicle::BrakeReleased);
    Input->BindAction(Left, ETriggerEvent::Started, this, &ARacingPlayerVehicle::LeftPressed);
    Input->BindAction(Left, ETriggerEvent::Completed, this, &ARacingPlayerVehicle::LeftReleased);
    Input->BindAction(Right, ETriggerEvent::Started, this, &ARacingPlayerVehicle::RightPressed);
    Input->BindAction(Right, ETriggerEvent::Completed, this, &ARacingPlayerVehicle::RightReleased);
    Input->BindAction(Handbrake, ETriggerEvent::Started, this, &ARacingPlayerVehicle::HandbrakePressed);
    Input->BindAction(Handbrake, ETriggerEvent::Completed, this, &ARacingPlayerVehicle::HandbrakeReleased);
    Input->BindAction(CameraAction, ETriggerEvent::Started, this, &ARacingPlayerVehicle::CycleCamera);
    Input->BindAction(Reset, ETriggerEvent::Started, this, &ARacingPlayerVehicle::ResetCar);
    Input->BindAction(Headlights, ETriggerEvent::Started, this, &ARacingPlayerVehicle::ToggleHeadlights);
    Input->BindAction(LeftSignal, ETriggerEvent::Started, this, &ARacingPlayerVehicle::ToggleLeftIndicator);
    Input->BindAction(RightSignal, ETriggerEvent::Started, this, &ARacingPlayerVehicle::ToggleRightIndicator);
    Input->BindAction(Interact, ETriggerEvent::Started, this, &ARacingPlayerVehicle::RaceInteract);
    Input->BindAction(Pause, ETriggerEvent::Started, this, &ARacingPlayerVehicle::RacePause);
    Input->BindAction(Restart, ETriggerEvent::Started, this, &ARacingPlayerVehicle::RaceRestart);
    Input->BindAction(Leave, ETriggerEvent::Started, this, &ARacingPlayerVehicle::RaceLeave);
    Subsystem->AddMappingContext(DrivingContext, 0);
    UE_LOG(LogRacingMVP, Display, TEXT("P2 keyboard mapped: W S A D Space C R H Z X"));
}

void ARacingPlayerVehicle::ThrottlePressed(const FInputActionValue&) { bThrottleHeld = true; }
void ARacingPlayerVehicle::ThrottleReleased(const FInputActionValue&) { bThrottleHeld = false; }
void ARacingPlayerVehicle::BrakePressed(const FInputActionValue&) { bBrakeHeld = true; }
void ARacingPlayerVehicle::BrakeReleased(const FInputActionValue&) { bBrakeHeld = false; }
void ARacingPlayerVehicle::LeftPressed(const FInputActionValue&) { bLeftHeld = true; }
void ARacingPlayerVehicle::LeftReleased(const FInputActionValue&) { bLeftHeld = false; }
void ARacingPlayerVehicle::RightPressed(const FInputActionValue&) { bRightHeld = true; }
void ARacingPlayerVehicle::RightReleased(const FInputActionValue&) { bRightHeld = false; }
void ARacingPlayerVehicle::HandbrakePressed(const FInputActionValue&) { bHandbrakeHeld = true; }
void ARacingPlayerVehicle::HandbrakeReleased(const FInputActionValue&) { bHandbrakeHeld = false; }
void ARacingPlayerVehicle::CycleCamera(const FInputActionValue&)
{
    CameraMode = static_cast<ERacingCameraMode>((static_cast<uint8>(CameraMode) + 1) % 4);
    UE_LOG(LogRacingMVP, Display, TEXT("P1 camera mode=%d"), static_cast<int32>(CameraMode));
}
void ARacingPlayerVehicle::ResetCar(const FInputActionValue&)
{
    bThrottleHeld = bBrakeHeld = bLeftHeld = bRightHeld = bHandbrakeHeld = false;
    SmoothedSteering = 0;
    TeleportRaceVehicle(ResetTransform);
    UE_LOG(LogRacingMVP, Display, TEXT("P1 vehicle reset to spawn"));
}

void ARacingPlayerVehicle::SetRaceControlLocked(bool bLocked)
{
    bRaceControlLocked = bLocked;
    bThrottleHeld = bBrakeHeld = bLeftHeld = bRightHeld = bHandbrakeHeld = false;
    RaceAIThrottle = RaceAISteering = 0.0f;
    RaceAIBrake = 0.0f;
    SmoothedSteering = 0.0f;
}

void ARacingPlayerVehicle::SetRaceAIInputs(float Throttle, float Brake, float Steering)
{
    RaceAIThrottle = FMath::Clamp(Throttle, 0.0f, 1.0f);
    RaceAIBrake = FMath::Clamp(Brake, 0.0f, 1.0f);
    RaceAISteering = FMath::Clamp(Steering, -1.0f, 1.0f);
}

void ARacingPlayerVehicle::EnableRaceAI()
{
    bRaceAI = true;
    AutoPossessPlayer = EAutoReceiveInput::Disabled;
    if (UChaosWheeledVehicleMovementComponent* Chaos = GetChaosMovement())
        Chaos->SetRequiresControllerForInputs(false);
}

void ARacingPlayerVehicle::TeleportRaceVehicle(const FTransform& Target)
{
    if (UChaosWheeledVehicleMovementComponent* Chaos = GetChaosMovement())
    {
        Chaos->ResetVehicle();
        Chaos->SetTargetGear(1, true);
    }
    GetMesh()->SetPhysicsLinearVelocity(FVector::ZeroVector);
    GetMesh()->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
    SetActorTransform(Target, false, nullptr, ETeleportType::TeleportPhysics);
}

void ARacingPlayerVehicle::SetProxyPaint(UMaterialInterface* Paint)
{
    if (Paint && !P0ProxyParts.IsEmpty() && P0ProxyParts[0]) P0ProxyParts[0]->SetMaterial(0, Paint);
}

void ARacingPlayerVehicle::RaceInteract(const FInputActionValue&)
{
    if (const ARacingGameMode* Mode = GetWorld()->GetAuthGameMode<ARacingGameMode>())
        if (ARaceManager* Race = Mode->GetRaceManager()) Race->HandleInteract();
}

void ARacingPlayerVehicle::RacePause(const FInputActionValue&)
{
    if (const ARacingGameMode* Mode = GetWorld()->GetAuthGameMode<ARacingGameMode>())
        if (ARaceManager* Race = Mode->GetRaceManager()) Race->HandlePause();
}

void ARacingPlayerVehicle::RaceRestart(const FInputActionValue&)
{
    if (const ARacingGameMode* Mode = GetWorld()->GetAuthGameMode<ARacingGameMode>())
        if (ARaceManager* Race = Mode->GetRaceManager()) Race->HandleRestart();
}

void ARacingPlayerVehicle::RaceLeave(const FInputActionValue&)
{
    if (const ARacingGameMode* Mode = GetWorld()->GetAuthGameMode<ARacingGameMode>())
        if (ARaceManager* Race = Mode->GetRaceManager()) Race->HandleLeave();
}

void ARacingPlayerVehicle::ToggleHeadlights(const FInputActionValue&)
{
    bHeadlightsOn = !bHeadlightsOn;
    UE_LOG(LogRacingMVP, Display, TEXT("P2 headlights=%d"), bHeadlightsOn);
}

void ARacingPlayerVehicle::ToggleLeftIndicator(const FInputActionValue&)
{
    bLeftIndicatorOn = !bLeftIndicatorOn;
    if (bLeftIndicatorOn) bRightIndicatorOn = false;
    UE_LOG(LogRacingMVP, Display, TEXT("P2 left indicator=%d"), bLeftIndicatorOn);
}

void ARacingPlayerVehicle::ToggleRightIndicator(const FInputActionValue&)
{
    bRightIndicatorOn = !bRightIndicatorOn;
    if (bRightIndicatorOn) bLeftIndicatorOn = false;
    UE_LOG(LogRacingMVP, Display, TEXT("P2 right indicator=%d"), bRightIndicatorOn);
}
