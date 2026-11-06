#include "TrafficManager.h"
#include "TrafficVehicle.h"
#include "RoadLaneSpline.h"
#include "RoadNetworkSubsystem.h"
#include "RacingMVP.h"
#include "Components/SplineComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"

ATrafficManager::ATrafficManager()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickInterval = 0.25f;
}

void ATrafficManager::BeginPlay()
{
    Super::BeginPlay();
}

void ATrafficManager::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    InitializeRetrySeconds += DeltaSeconds;
    GradeUpdateSeconds += DeltaSeconds;
    HealthLogSeconds += DeltaSeconds;
    PoolRecycleSeconds += DeltaSeconds;
    if (!bPoolInitialized && InitializeRetrySeconds >= 1.0f) TryInitializePool();

    APawn* Player = GetWorld() && GetWorld()->GetFirstPlayerController() ? GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr;
    if (Player && GradeUpdateSeconds >= 1.0f)
    {
        GradeUpdateSeconds = 0.0f;
        UpdateTrafficGrades(Player);
    }
    if (Player && bPoolInitialized && PoolRecycleSeconds >= 3.0f)
    {
        PoolRecycleSeconds = 0.0f;
        TArray<FVector> OccupiedLocations;
        for (ATrafficVehicle* Vehicle : TrafficVehicles)
            if (Vehicle && Vehicle->IsTrafficActive()) OccupiedLocations.Add(Vehicle->GetActorLocation());
        for (ATrafficVehicle* Vehicle : TrafficVehicles)
        {
            if (!Vehicle || Vehicle->IsTrafficActive()) continue;
            if (PlaceVehicleNearPlayer(Vehicle, Player, OccupiedLocations))
            {
                OccupiedLocations.Add(Vehicle->GetActorLocation());
                ++PoolRecycleCount;
            }
        }
    }
    if (HealthLogSeconds >= 10.0f)
    {
        HealthLogSeconds = 0.0f;
        LogTrafficHealth();
    }
}

void ATrafficManager::TryInitializePool()
{
    UWorld* World = GetWorld();
    URoadNetworkSubsystem* Network = World ? World->GetSubsystem<URoadNetworkSubsystem>() : nullptr;
    APawn* Player = World && World->GetFirstPlayerController() ? World->GetFirstPlayerController()->GetPawn() : nullptr;
    if (!World || !Network || Network->GetLanes().IsEmpty() || !Player) return;

    const int32 DesiredCount = FMath::Clamp(MaxTrafficVehicles, 0, 20);
    TArray<FVector> OccupiedLocations;
    for (int32 Index = 0; Index < DesiredCount; ++Index)
    {
        ATrafficVehicle* Vehicle = World->SpawnActor<ATrafficVehicle>(ATrafficVehicle::StaticClass(), Player->GetActorLocation(), Player->GetActorRotation());
        if (!Vehicle) continue;
        TrafficVehicles.Add(Vehicle);
        if (!PlaceVehicleNearPlayer(Vehicle, Player, OccupiedLocations))
        {
            Vehicle->SetSimulationGrade(ETrafficSimulationGrade::Pooled);
            UE_LOG(LogRacingMVP, Warning, TEXT("P4 traffic: pooled vehicle %d could not find a safe nearby road slot."), Index);
        }
        else
        {
            OccupiedLocations.Add(Vehicle->GetActorLocation());
        }
    }
    bPoolInitialized = true;
    UE_LOG(LogRacingMVP, Display, TEXT("P4 traffic pool initialized: vehicles=%d cap=%d"), TrafficVehicles.Num(), DesiredCount);
}

bool ATrafficManager::PlaceVehicleNearPlayer(ATrafficVehicle* Vehicle, const APawn* Player, const TArray<FVector>& OccupiedLocations)
{
    if (!Vehicle || !Player || !GetWorld()) return false;
    URoadNetworkSubsystem* Network = GetWorld()->GetSubsystem<URoadNetworkSubsystem>();
    if (!Network) return false;
    struct FSpawnSlot { ARoadLaneSpline* Lane; float Distance; FVector Position; float PlayerDistance; };
    TArray<FSpawnSlot> Slots;
    for (const TObjectPtr<ARoadLaneSpline>& LanePtr : Network->GetLanes())
    {
        ARoadLaneSpline* Lane = LanePtr.Get();
        if (!Lane || !Lane->LaneSpline || Lane->LaneSpline->GetSplineLength() < 1000.0f) continue;
        const float Length = Lane->LaneSpline->GetSplineLength();
        const int32 Samples = FMath::Clamp(FMath::CeilToInt(Length / 3000.0f), 1, 100);
        for (int32 Sample = 0; Sample <= Samples; ++Sample)
        {
            const float Distance = Length * static_cast<float>(Sample) / Samples;
            const FVector Position = Lane->LaneSpline->GetLocationAtDistanceAlongSpline(Distance, ESplineCoordinateSpace::World) + FVector(0, 0, 2.0f);
            const float PlayerDistance = FVector::Dist2D(Position, Player->GetActorLocation());
            if (PlayerDistance < 2500.0f || PlayerDistance > 68000.0f) continue;
            bool bSafe = true;
            for (const FVector& Occupied : OccupiedLocations)
                if (FVector::Dist2D(Occupied, Position) < 1400.0f) { bSafe = false; break; }
            if (!bSafe) continue;
            FHitResult Hit;
            FCollisionQueryParams Params(SCENE_QUERY_STAT(TrafficSpawnClearance), false, Vehicle);
            const FVector ClearanceCenter = Position + FVector(0, 0, 70.0f);
            if (GetWorld()->SweepSingleByChannel(Hit, ClearanceCenter, ClearanceCenter, FQuat::Identity, ECC_Pawn,
                FCollisionShape::MakeBox(FVector(210.0f, 90.0f, 60.0f)), Params)) continue;
            Slots.Add({Lane, Distance, Position, PlayerDistance});
        }
    }
    if (Slots.IsEmpty()) return false;
    Slots.Sort([](const FSpawnSlot& A, const FSpawnSlot& B) { return A.PlayerDistance < B.PlayerDistance; });
    const int32 PickLimit = FMath::Min(12, Slots.Num());
    const FSpawnSlot& Slot = Slots[FMath::RandRange(0, PickLimit - 1)];
    Vehicle->InitializeTraffic(this, Slot.Lane, Slot.Distance);
    Vehicle->SetSimulationGrade(Slot.PlayerDistance < 25000.0f ? ETrafficSimulationGrade::Near : ETrafficSimulationGrade::Mid);
    return true;
}

void ATrafficManager::UpdateTrafficGrades(const APawn* Player)
{
    if (!Player) return;
    const FVector PlayerLocation = Player->GetActorLocation();
    for (ATrafficVehicle* Vehicle : TrafficVehicles)
    {
        if (!Vehicle) continue;
        const float Distance = FVector::Dist(PlayerLocation, Vehicle->GetActorLocation());
        if (Distance > 70000.0f)
        {
            Vehicle->SetSimulationGrade(ETrafficSimulationGrade::Pooled);
            continue;
        }
        const ETrafficSimulationGrade Grade = Distance <= 25000.0f ? ETrafficSimulationGrade::Near :
            (Distance <= 65000.0f ? ETrafficSimulationGrade::Mid : ETrafficSimulationGrade::Far);
        Vehicle->SetSimulationGrade(Grade);
    }
}

void ATrafficManager::RecordTrafficOverlap(const AActor* OtherActor)
{
    if (!OtherActor) return;
    ++TrafficOverlapCount;
    UE_LOG(LogRacingMVP, Warning, TEXT("P4 traffic overlap detected with %s (count=%d)."), *GetNameSafe(OtherActor), TrafficOverlapCount);
}

void ATrafficManager::LogTrafficHealth()
{
    int32 Near = 0, Mid = 0, Far = 0, Pooled = 0;
    for (const ATrafficVehicle* Vehicle : TrafficVehicles)
    {
        if (!Vehicle) continue;
        switch (Vehicle->SimulationGrade)
        {
        case ETrafficSimulationGrade::Near: ++Near; break;
        case ETrafficSimulationGrade::Mid: ++Mid; break;
        case ETrafficSimulationGrade::Far: ++Far; break;
        case ETrafficSimulationGrade::Pooled: ++Pooled; break;
        }
    }
    UE_LOG(LogRacingMVP, Display, TEXT("P4 traffic health: total=%d near=%d mid=%d far=%d pooled=%d overlap=%d recycled=%d"),
        TrafficVehicles.Num(), Near, Mid, Far, Pooled, TrafficOverlapCount, PoolRecycleCount);
}
