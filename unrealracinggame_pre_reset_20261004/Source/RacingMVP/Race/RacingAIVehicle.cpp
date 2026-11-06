#include "Race/RacingAIVehicle.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Road/TrafficVehicle.h"
#include "RacingMVP.h"
#include "EngineUtils.h"
#include "Engine/World.h"

ARacingAIVehicle::ARacingAIVehicle(const FObjectInitializer& ObjectInitializer) : Super(ObjectInitializer)
{
    AutoPossessPlayer = EAutoReceiveInput::Disabled;
    EnableRaceAI();
}

void ARacingAIVehicle::BeginPlay()
{
    Super::BeginPlay();
    static const TCHAR* PaintPaths[] = {
        TEXT("/Game/RacingMVP/World/Materials/M_P3SignalRed.M_P3SignalRed"),
        TEXT("/Game/RacingMVP/World/Materials/M_P3SignalYellow.M_P3SignalYellow"),
        TEXT("/Game/RacingMVP/World/Materials/M_P3SignalGreen.M_P3SignalGreen")
    };
    if (UMaterialInterface* Paint = LoadObject<UMaterialInterface>(nullptr, PaintPaths[FMath::Clamp(ColorIndex, 0, 2)]))
        SetProxyPaint(Paint);
}

void ARacingAIVehicle::ConfigureRaceLine(float InLaneY, float InTargetSpeedKmh, int32 InColorIndex)
{
    LaneY = InLaneY;
    TargetSpeedKmh = InTargetSpeedKmh;
    ColorIndex = InColorIndex;
    static const TCHAR* PaintPaths[] = {
        TEXT("/Game/RacingMVP/World/Materials/M_P3SignalRed.M_P3SignalRed"),
        TEXT("/Game/RacingMVP/World/Materials/M_P3SignalYellow.M_P3SignalYellow"),
        TEXT("/Game/RacingMVP/World/Materials/M_P3SignalGreen.M_P3SignalGreen")
    };
    if (UMaterialInterface* Paint = LoadObject<UMaterialInterface>(nullptr, PaintPaths[FMath::Clamp(ColorIndex, 0, 2)]))
        SetProxyPaint(Paint);
}

void ARacingAIVehicle::SetRaceRunning(bool bRunning)
{
    bRaceRunning = bRunning;
    SetRaceControlLocked(!bRunning);
    if (!bRunning) SetRaceAIInputs(0.0f, 1.0f, 0.0f);
}

void ARacingAIVehicle::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!bRaceRunning) return;

    UChaosWheeledVehicleMovementComponent* Chaos = GetChaosMovement();
    if (!Chaos) return;
    const FVector Position = GetActorLocation();
    const float SpeedKmh = FMath::Abs(Chaos->GetForwardSpeed()) * 0.036f;
    const FVector LookAhead(Position.X + FMath::Clamp(800.0f + SpeedKmh * 15.0f, 800.0f, 2500.0f), LaneY, Position.Z);
    const FVector LocalTarget = GetActorTransform().InverseTransformPosition(LookAhead);
    const float HeadingError = FMath::Atan2(LocalTarget.Y, FMath::Max(100.0f, LocalTarget.X));
    float Steering = FMath::Clamp(HeadingError * 2.5f, -0.75f, 0.75f);
    float DesiredSpeed = TargetSpeedKmh;

    // A nearby traffic proxy can occupy the racing lane. Slow until a short lateral opening exists.
    for (TActorIterator<ATrafficVehicle> It(GetWorld()); It; ++It)
    {
        if (!It->IsTrafficActive()) continue;
        const FVector Delta = It->GetActorLocation() - Position;
        if (Delta.X > 0.0f && Delta.X < 2200.0f && FMath::Abs(Delta.Y) < 330.0f)
        {
            DesiredSpeed = FMath::Min(DesiredSpeed, Delta.X < 1000.0f ? 18.0f : 45.0f);
            Steering += Position.Y < 29250.0f ? -0.16f : 0.16f;
            break;
        }
    }
    const float SpeedError = DesiredSpeed - SpeedKmh;
    SetRaceAIInputs(FMath::Clamp(SpeedError / 25.0f, 0.0f, 1.0f),
        FMath::Clamp(-SpeedError / 22.0f, 0.0f, 0.7f), FMath::Clamp(Steering, -0.75f, 0.75f));

    DebugClock += DeltaSeconds;
    if (DebugClock >= 5.0f)
    {
        DebugClock = 0.0f;
        UE_LOG(LogRacingMVP, Display, TEXT("P5 AI telemetry: %s x=%.0f y=%.0f speed=%.1f gear=%d throttle=%.2f brake=%.2f"),
            *GetName(), Position.X, Position.Y, SpeedKmh, Chaos->GetCurrentGear(),
            Chaos->GetThrottleInput(), Chaos->GetBrakeInput());
    }

    StuckSeconds = SpeedKmh < 3.0f || FMath::Abs(Position.Y - LaneY) > 1800.0f || Position.Z < -200.0f
        ? StuckSeconds + DeltaSeconds : 0.0f;
    if (StuckSeconds > 8.0f)
    {
        const float RecoveryX = FMath::Clamp(Position.X + 300.0f, -43000.0f, 41000.0f);
        TeleportRaceVehicle(FTransform(FRotator::ZeroRotator, FVector(RecoveryX, LaneY, 180.0f)));
        StuckSeconds = 0.0f;
        UE_LOG(LogRacingMVP, Warning, TEXT("P5 AI recovery: %s at x=%.0f"), *GetName(), RecoveryX);
    }
}
