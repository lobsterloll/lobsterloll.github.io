#include "CityPlayerController.h"
#include "CityVehicleAudioComponent.h"
#include "EnhancedInputSubsystems.h"
#include "EnhancedInputComponent.h"
#include "EnhancedActionKeyMapping.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Engine/LocalPlayer.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputCoreTypes.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "WheeledVehiclePawn.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"

void ACityPlayerController::SetupInputComponent()
{
    Super::SetupInputComponent();

    if (!IsLocalPlayerController())
    {
        return;
    }

    DrivingKeys = NewObject<UInputMappingContext>(this);
    auto MapKey = [this](const TCHAR* ActionPath, FKey Key, bool bNegate = false)
    {
        if (UInputAction* Action = LoadObject<UInputAction>(nullptr, ActionPath))
        {
            FEnhancedActionKeyMapping& Mapping = DrivingKeys->MapKey(Action, Key);
            if (bNegate)
            {
                Mapping.Modifiers.Add(NewObject<UInputModifierNegate>(DrivingKeys));
            }
        }
    };

    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Throttle.IA_Throttle"), EKeys::W);
    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Brake.IA_Brake"), EKeys::S);
    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Steering.IA_Steering"), EKeys::A, true);
    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Steering.IA_Steering"), EKeys::D);
    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Handbrake.IA_Handbrake"), EKeys::SpaceBar);
    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Reset.IA_Reset"), EKeys::R);
    MapKey(TEXT("/Game/VehicleTemplate/Input/Actions/IA_Headlights.IA_Headlights"), EKeys::H);

    CameraAction = NewObject<UInputAction>(this);
    CameraAction->ValueType = EInputActionValueType::Boolean;
    DrivingKeys->MapKey(CameraAction, EKeys::C);
    CastChecked<UEnhancedInputComponent>(InputComponent)->BindAction(
        CameraAction, ETriggerEvent::Started, this, &ACityPlayerController::CycleCamera);

    if (UEnhancedInputLocalPlayerSubsystem* Input =
            ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
    {
        Input->AddMappingContext(DrivingKeys, 0);
    }
}

void ACityPlayerController::OnPossess(APawn* InPawn)
{
    Super::OnPossess(InPawn);

    CameraMode = 0;
    ApplyCameraMode();

    UCityVehicleAudioComponent* Audio = NewObject<UCityVehicleAudioComponent>(InPawn);
    InPawn->AddInstanceComponent(Audio);
    Audio->RegisterComponent();

    BrakeLamps.Empty();
    ReverseLamps.Empty();

    UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    UMaterialInterface* Red = LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/Materials/M_TrafficRed.M_TrafficRed"));
    UMaterialInterface* White = LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/Materials/M_CityLampGlow.M_CityLampGlow"));
    if (!Cube || !Red || !White)
    {
        return;
    }

    for (float Side : {-1.0f, 1.0f})
    {
        BrakeLamps.Add(CreateLamp(InPawn, Cube, Red,
            FVector(-218, Side * 68, 67), FVector(0.04f, 0.34f, 0.08f)));
        ReverseLamps.Add(CreateLamp(InPawn, Cube, White,
            FVector(-220, Side * 33, 55), FVector(0.04f, 0.16f, 0.06f)));
    }
}

void ACityPlayerController::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    AWheeledVehiclePawn* Vehicle = Cast<AWheeledVehiclePawn>(GetPawn());
    if (!Vehicle)
    {
        return;
    }

    UChaosWheeledVehicleMovementComponent* Movement =
        Cast<UChaosWheeledVehicleMovementComponent>(Vehicle->GetVehicleMovementComponent());
    if (!Movement)
    {
        return;
    }

    const bool bBraking = Movement->GetBrakeInput() > 0.1f || Movement->GetHandbrakeInput();
    const bool bReversing = Movement->GetCurrentGear() < 0;
    for (UStaticMeshComponent* Lamp : BrakeLamps)
    {
        Lamp->SetVisibility(bBraking);
    }
    for (UStaticMeshComponent* Lamp : ReverseLamps)
    {
        Lamp->SetVisibility(bReversing);
    }
}

UStaticMeshComponent* ACityPlayerController::CreateLamp(APawn* Vehicle, UStaticMesh* Mesh,
    UMaterialInterface* Material, const FVector& Location, const FVector& Scale)
{
    UStaticMeshComponent* Lamp = NewObject<UStaticMeshComponent>(Vehicle);
    Lamp->SetupAttachment(Vehicle->GetRootComponent());
    Lamp->SetStaticMesh(Mesh);
    Lamp->SetMaterial(0, Material);
    Lamp->SetRelativeLocation(Location);
    Lamp->SetRelativeScale3D(Scale);
    Lamp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Lamp->SetCastShadow(false);
    Lamp->SetVisibility(false);
    Vehicle->AddInstanceComponent(Lamp);
    Lamp->RegisterComponent();
    return Lamp;
}

void ACityPlayerController::CycleCamera()
{
    CameraMode = (CameraMode + 1) % 4;
    ApplyCameraMode();
}

void ACityPlayerController::ApplyCameraMode()
{
    APawn* VehiclePawn = GetPawn();
    if (!VehiclePawn)
    {
        return;
    }

    TInlineComponentArray<USpringArmComponent*> Arms(VehiclePawn);
    for (USpringArmComponent* Arm : Arms)
    {
        if (Arm->GetName().Contains(TEXT("BackSpringArm")))
        {
            Arm->TargetArmLength = CameraMode == 1 ? 650.0f : 950.0f;
            Arm->SocketOffset = CameraMode == 1 ? FVector(0, 0, 160) : FVector(0, 0, 220);
            Arm->SetRelativeRotation(CameraMode == 1 ? FRotator(-20, 0, 0) : FRotator(-24, 0, 0));
        }
        else if (Arm->GetName().Contains(TEXT("FrontSpringArm")))
        {
            Arm->TargetArmLength = 0;
            Arm->SetRelativeLocation(CameraMode == 2 ? FVector(-30, -35, 140) : FVector(110, 0, 125));
            Arm->SetRelativeRotation(FRotator::ZeroRotator);
        }
    }

    TInlineComponentArray<UCameraComponent*> Cameras(VehiclePawn);
    for (UCameraComponent* Camera : Cameras)
    {
        const bool bFront = Camera->GetName().Contains(TEXT("FrontCamera"));
        Camera->SetActive(bFront == (CameraMode >= 2));
        Camera->SetFieldOfView(CameraMode == 2 ? 85.0f : 90.0f);
    }
}
