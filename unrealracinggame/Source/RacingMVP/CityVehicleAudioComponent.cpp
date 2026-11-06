#include "CityVehicleAudioComponent.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "WheeledVehiclePawn.h"
#include "Components/AudioComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"
#include "Sound/SoundBase.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

UCityVehicleAudioComponent::UCityVehicleAudioComponent()
{
    PrimaryComponentTick.bCanEverTick = true;

    static ConstructorHelpers::FObjectFinder<USoundBase> IdleAsset(
        TEXT("/Game/Audio/SW_EngineIdle.SW_EngineIdle"));
    static ConstructorHelpers::FObjectFinder<USoundBase> HighAsset(
        TEXT("/Game/Audio/SW_EngineHigh.SW_EngineHigh"));
    static ConstructorHelpers::FObjectFinder<USoundBase> WindAsset(
        TEXT("/Game/Audio/SW_Wind.SW_Wind"));
    static ConstructorHelpers::FObjectFinder<USoundBase> SkidAsset(
        TEXT("/Game/Audio/SW_TireSkid.SW_TireSkid"));
    static ConstructorHelpers::FObjectFinder<USoundBase> CollisionAsset(
        TEXT("/Game/Audio/SW_Collision.SW_Collision"));
    IdleSound = IdleAsset.Object;
    HighSound = HighAsset.Object;
    WindSound = WindAsset.Object;
    SkidSound = SkidAsset.Object;
    CollisionSound = CollisionAsset.Object;
}

void UCityVehicleAudioComponent::BeginPlay()
{
    Super::BeginPlay();

    AWheeledVehiclePawn* Vehicle = Cast<AWheeledVehiclePawn>(GetOwner());
    if (!Vehicle)
    {
        return;
    }

    Movement = Cast<UChaosWheeledVehicleMovementComponent>(Vehicle->GetVehicleMovementComponent());
    if (!Movement)
    {
        return;
    }

    if (!IdleSound || !HighSound || !WindSound || !SkidSound)
    {
        return;
    }

    auto StartLoop = [Vehicle](USoundBase* Sound)
    {
        UAudioComponent* Audio = NewObject<UAudioComponent>(Vehicle);
        Audio->SetupAttachment(Vehicle->GetRootComponent());
        Audio->bAutoActivate = false;
        Audio->SetSound(Sound);
        Audio->SetVolumeMultiplier(0.0f);
        Vehicle->AddInstanceComponent(Audio);
        Audio->RegisterComponent();
        Audio->Play();
        return Audio;
    };

    IdleAudio = StartLoop(IdleSound);
    HighAudio = StartLoop(HighSound);
    WindAudio = StartLoop(WindSound);
    SkidAudio = StartLoop(SkidSound);
    PreviousGear = Movement->GetCurrentGear();
    Vehicle->GetMesh()->SetNotifyRigidBodyCollision(true);
    Vehicle->GetMesh()->OnComponentHit.AddDynamic(this, &UCityVehicleAudioComponent::HandleVehicleHit);
}

void UCityVehicleAudioComponent::TickComponent(float DeltaTime, ELevelTick TickType,
    FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    if (!Movement || !IdleAudio || !HighAudio || !WindAudio || !SkidAudio)
    {
        return;
    }

    const float Rpm = Movement->GetEngineRotationSpeed();
    const float Load = FMath::Clamp((Rpm - 900.0f) / 5100.0f, 0.0f, 1.0f);
    const float SpeedKmh = FMath::Abs(Movement->GetForwardSpeed()) * 0.036f;
    const int32 Gear = Movement->GetCurrentGear();
    if (Gear != PreviousGear)
    {
        ShiftDip = 1.0f;
        PreviousGear = Gear;
    }
    ShiftDip = FMath::Max(0.0f, ShiftDip - DeltaTime * 4.0f);

    float Slip = 0.0f;
    bool bOnGrass = false;
    for (int32 Index = 0; Index < Movement->GetNumWheels(); ++Index)
    {
        const FWheelStatus& Wheel = Movement->GetWheelState(Index);
        if (Wheel.bInContact)
        {
            if (const UPhysicalMaterial* Physical = Wheel.PhysMaterial.Get())
            {
                bOnGrass |= Physical->GetFName() == FName(TEXT("PM_CityGrass"));
            }
        }
        if (Wheel.bInContact && (Wheel.bIsSkidding || Wheel.bIsSlipping))
        {
            Slip = FMath::Max(Slip, Wheel.SkidMagnitude + Wheel.SlipMagnitude);
        }
    }

    IdleAudio->SetPitchMultiplier(FMath::Lerp(0.9f, 1.35f, Load));
    IdleAudio->SetVolumeMultiplier(FMath::Lerp(0.55f, 0.10f, Load));
    HighAudio->SetPitchMultiplier(FMath::Lerp(0.75f, 1.3f, Load));
    HighAudio->SetVolumeMultiplier(FMath::Lerp(0.0f, 0.65f, Load) * (1.0f - ShiftDip * 0.65f));
    WindAudio->SetVolumeMultiplier(FMath::Clamp((SpeedKmh - 45.0f) / 135.0f, 0.0f, 1.0f) * 0.35f);
    SkidAudio->SetPitchMultiplier(bOnGrass ? 0.7f : 1.0f);
    SkidAudio->SetVolumeMultiplier(FMath::Clamp(Slip / 150.0f, 0.0f,
        bOnGrass ? 0.12f : 0.55f));
}

void UCityVehicleAudioComponent::HandleVehicleHit(UPrimitiveComponent* HitComponent,
    AActor* OtherActor, UPrimitiveComponent* OtherComp, FVector NormalImpulse,
    const FHitResult& Hit)
{
    if (!CollisionSound || NormalImpulse.Size() < 50000.0f)
    {
        return;
    }

    const float Now = GetWorld()->GetTimeSeconds();
    if (Now - LastCollisionTime < 0.4f)
    {
        return;
    }

    LastCollisionTime = Now;
    UGameplayStatics::PlaySoundAtLocation(this, CollisionSound, Hit.ImpactPoint,
        FMath::Clamp(NormalImpulse.Size() / 300000.0f, 0.15f, 0.8f));
}
