#include "TrafficVehicle.h"
#include "RoadLaneSpline.h"
#include "RoadNetworkSubsystem.h"
#include "RacingMVP.h"
#include "TrafficManager.h"
#include "TrafficSignalController.h"
#include "Components/BoxComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SplineComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "UObject/ConstructorHelpers.h"

ATrafficVehicle::ATrafficVehicle()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickInterval = 0.05f;
    TrafficOverlap = CreateDefaultSubobject<UBoxComponent>(TEXT("TrafficOverlap"));
    SetRootComponent(TrafficOverlap);
    TrafficOverlap->SetBoxExtent(FVector(215.0f, 92.0f, 62.0f));
    TrafficOverlap->SetRelativeLocation(FVector(0.0f, 0.0f, 70.0f));
    TrafficOverlap->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    TrafficOverlap->SetCollisionObjectType(ECC_Vehicle);
    TrafficOverlap->SetCollisionResponseToAllChannels(ECR_Overlap);
    TrafficOverlap->SetGenerateOverlapEvents(true);
    TrafficOverlap->OnComponentBeginOverlap.AddDynamic(this, &ATrafficVehicle::HandleOverlap);

    VehicleVisual = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("VehicleVisual"));
    VehicleVisual->SetupAttachment(RootComponent);
    VehicleVisual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    VehicleVisual->SetRelativeLocation(FVector::ZeroVector);
    static ConstructorHelpers::FObjectFinder<USkeletalMesh> TrafficMesh(
        TEXT("/Game/Vehicles/SportsCar/SKM_SportsCar.SKM_SportsCar"));
    if (TrafficMesh.Succeeded()) VehicleVisual->SetSkeletalMesh(TrafficMesh.Object);
}

void ATrafficVehicle::BeginPlay()
{
    Super::BeginPlay();
}

void ATrafficVehicle::InitializeTraffic(ATrafficManager* InManager, ARoadLaneSpline* InLane, float InDistanceCm)
{
    Manager = InManager;
    CurrentLane = InLane;
    DistanceOnLaneCm = InDistanceCm;
    SpeedCmPerSecond = 0.0f;
    TargetSpeedCmPerSecond = InLane ? InLane->SpeedLimitKmh * (100000.0f / 3600.0f) : 0.0f;
    TrafficState = ETrafficState::Cruise;
    SetTrafficActive(InLane != nullptr);
    if (bTrafficActive) UpdateLanePosition(0.0f);
}

void ATrafficVehicle::SetSimulationGrade(ETrafficSimulationGrade NewGrade)
{
    SimulationGrade = NewGrade;
    switch (SimulationGrade)
    {
    case ETrafficSimulationGrade::Near: SetActorTickInterval(0.05f); break;
    case ETrafficSimulationGrade::Mid: SetActorTickInterval(0.12f); break;
    case ETrafficSimulationGrade::Far: SetActorTickInterval(0.35f); break;
    case ETrafficSimulationGrade::Pooled: SetActorTickInterval(0.5f); break;
    }
    SetTrafficActive(NewGrade != ETrafficSimulationGrade::Pooled);
}

void ATrafficVehicle::SetTrafficActive(bool bActive)
{
    bTrafficActive = bActive;
    SetActorHiddenInGame(!bActive);
    SetActorEnableCollision(bActive);
    SetActorTickEnabled(bActive);
    if (!bActive) SimulationGrade = ETrafficSimulationGrade::Pooled;
}

void ATrafficVehicle::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!bTrafficActive || !CurrentLane || !CurrentLane->LaneSpline) return;
    BrainAccumulator += DeltaSeconds;
    StateHoldSeconds += DeltaSeconds;
    const float BrainPeriod = SimulationGrade == ETrafficSimulationGrade::Near ? 0.1f :
        (SimulationGrade == ETrafficSimulationGrade::Mid ? 0.18f : 0.45f);
    if (BrainAccumulator >= BrainPeriod)
    {
        const float BrainDelta = BrainAccumulator;
        BrainAccumulator = 0.0f;
        UpdateTrafficBrain(BrainDelta);
    }
    UpdateLanePosition(DeltaSeconds);
}

void ATrafficVehicle::UpdateTrafficBrain(float DeltaSeconds)
{
    if (!CurrentLane || !CurrentLane->LaneSpline) return;
    UWorld* World = GetWorld();
    if (!World) return;

    TargetSpeedCmPerSecond = FMath::Max(0.0f, CurrentLane->SpeedLimitKmh * (100000.0f / 3600.0f));
    const float RemainingCm = CurrentLane->LaneSpline->GetSplineLength() - DistanceOnLaneCm;
    bool bSignalRequiresStop = false;
    for (TActorIterator<ATrafficSignalController> It(World); It; ++It)
    {
        ATrafficSignalController* Signal = *It;
        if (Signal->IntersectionNodeID != CurrentLane->EndNodeID) continue;
        const ERoadSignalState State = Signal->GetStateForLane(CurrentLane->LaneID);
        const float StopDistance = FMath::Max(0.0f, CurrentLane->StopLineDistanceM * 100.0f);
        const float DistanceToLine = RemainingCm - StopDistance;
        if (State != ERoadSignalState::Green && DistanceToLine < 1800.0f && DistanceToLine > -100.0f)
        {
            TargetSpeedCmPerSecond = DistanceToLine > 350.0f ? FMath::Min(TargetSpeedCmPerSecond, DistanceToLine * 0.7f) : 0.0f;
            TrafficState = DistanceToLine > 350.0f ? ETrafficState::ApproachLight : ETrafficState::StopAtLight;
            if (DistanceToLine <= 350.0f) TrafficState = ETrafficState::Wait;
            StateHoldSeconds = 0.0f;
            bSignalRequiresStop = true;
            break;
        }
    }
    if (bSignalRequiresStop)
    {
        const float Acceleration = TargetSpeedCmPerSecond < SpeedCmPerSecond ? 700.0f : 250.0f;
        SpeedCmPerSecond = FMath::FInterpConstantTo(SpeedCmPerSecond, TargetSpeedCmPerSecond, DeltaSeconds, Acceleration);
        return;
    }

    const FVector CurrentLocation = GetActorLocation();
    float NearestAheadCm = TNumericLimits<float>::Max();
    auto CheckVehicle = [&](const AActor* Other, const ARoadLaneSpline* OtherLane, float OtherDistance)
    {
        if (!Other || Other == this) return;
        if (OtherLane == CurrentLane)
        {
            float Ahead = OtherDistance - DistanceOnLaneCm;
            if (Ahead < -200.0f) Ahead += CurrentLane->LaneSpline->GetSplineLength();
            if (Ahead > 0.0f) NearestAheadCm = FMath::Min(NearestAheadCm, Ahead);
        }
    };
    if (Manager)
    {
        for (ATrafficVehicle* Other : Manager->GetTrafficVehicles())
            if (Other && Other->IsTrafficActive()) CheckVehicle(Other, Other->CurrentLane, Other->DistanceOnLaneCm);
    }
    if (APawn* Player = World->GetFirstPlayerController() ? World->GetFirstPlayerController()->GetPawn() : nullptr)
    {
        const FVector PlayerLocation = Player->GetActorLocation();
        const float PlayerDistance = CurrentLane->LaneSpline->FindInputKeyClosestToWorldLocation(PlayerLocation);
        const float PlayerProjectionDistance = CurrentLane->LaneSpline->GetDistanceAlongSplineAtSplineInputKey(PlayerDistance);
        const FVector Projected = CurrentLane->LaneSpline->GetLocationAtDistanceAlongSpline(PlayerProjectionDistance, ESplineCoordinateSpace::World);
        if (FVector::Dist2D(PlayerLocation, Projected) < 480.0f)
            CheckVehicle(Player, CurrentLane, PlayerProjectionDistance);
    }

    if (NearestAheadCm < 2400.0f)
    {
        TargetSpeedCmPerSecond = FMath::Min(TargetSpeedCmPerSecond, FMath::Max(0.0f, (NearestAheadCm - 700.0f) * 0.45f));
        TrafficState = ETrafficState::Follow;
        if (NearestAheadCm < 1000.0f && StateHoldSeconds > 3.0f && !CurrentLane->AdjacentLaneIDs.IsEmpty())
        {
            URoadNetworkSubsystem* Network = World->GetSubsystem<URoadNetworkSubsystem>();
            for (const FName AdjacentID : CurrentLane->AdjacentLaneIDs)
            {
                ARoadLaneSpline* Candidate = Network ? Network->FindLane(AdjacentID) : nullptr;
                if (!Candidate || !Candidate->LaneSpline || Candidate->StartNodeID != CurrentLane->StartNodeID || Candidate->EndNodeID != CurrentLane->EndNodeID) continue;
                const FVector CandidatePoint = Candidate->LaneSpline->FindLocationClosestToWorldLocation(CurrentLocation, ESplineCoordinateSpace::World);
                if (FVector::Dist2D(CandidatePoint, CurrentLocation) > 650.0f) continue;
                const float CandidateDistance = Candidate->LaneSpline->GetDistanceAlongSplineAtSplineInputKey(
                    Candidate->LaneSpline->FindInputKeyClosestToWorldLocation(CurrentLocation));
                bool bGapSafe = true;
                auto HasSafeGap = [&](const AActor* Other)
                {
                    if (!Other || Other == this) return;
                    const FVector OtherProjected = Candidate->LaneSpline->FindLocationClosestToWorldLocation(Other->GetActorLocation(), ESplineCoordinateSpace::World);
                    if (FVector::Dist2D(OtherProjected, Other->GetActorLocation()) > 400.0f) return;
                    const float OtherDistance = Candidate->LaneSpline->GetDistanceAlongSplineAtSplineInputKey(
                        Candidate->LaneSpline->FindInputKeyClosestToWorldLocation(Other->GetActorLocation()));
                    const float Delta = FMath::Abs(OtherDistance - CandidateDistance);
                    if (Delta < 1200.0f || Delta > Candidate->LaneSpline->GetSplineLength() - 1000.0f) bGapSafe = false;
                };
                if (Manager)
                    for (ATrafficVehicle* Other : Manager->GetTrafficVehicles())
                        if (Other && Other->IsTrafficActive()) HasSafeGap(Other);
                if (APawn* Player = World->GetFirstPlayerController() ? World->GetFirstPlayerController()->GetPawn() : nullptr)
                    HasSafeGap(Player);
                if (!bGapSafe) continue;
                CurrentLane = Candidate;
                DistanceOnLaneCm = CandidateDistance;
                TrafficState = ETrafficState::ChangeLane;
                StateHoldSeconds = 0.0f;
                break;
            }
        }
    }
    else if (CurrentLane->bMergeLane || CurrentLane->bExitLane)
    {
        TrafficState = ETrafficState::Merge;
    }
    else
    {
        TrafficState = ETrafficState::Cruise;
    }

    const float Acceleration = TargetSpeedCmPerSecond < SpeedCmPerSecond ? 700.0f : 250.0f;
    SpeedCmPerSecond = FMath::FInterpConstantTo(SpeedCmPerSecond, TargetSpeedCmPerSecond, DeltaSeconds, Acceleration);
}

void ATrafficVehicle::UpdateLanePosition(float DeltaSeconds)
{
    if (!CurrentLane || !CurrentLane->LaneSpline) return;
    DistanceOnLaneCm += SpeedCmPerSecond * DeltaSeconds;
    const float Length = CurrentLane->LaneSpline->GetSplineLength();
    if (DistanceOnLaneCm >= Length)
    {
        DistanceOnLaneCm = FMath::Max(0.0f, Length - 10.0f);
        ChooseNextLane();
    }
    const FVector Location = CurrentLane->LaneSpline->GetLocationAtDistanceAlongSpline(DistanceOnLaneCm, ESplineCoordinateSpace::World) + FVector(0, 0, 2.0f);
    const FRotator Rotation = CurrentLane->LaneSpline->GetRotationAtDistanceAlongSpline(DistanceOnLaneCm, ESplineCoordinateSpace::World);
    SetActorLocationAndRotation(Location, FRotator(0.0f, Rotation.Yaw, 0.0f), false, nullptr, ETeleportType::TeleportPhysics);
}

void ATrafficVehicle::ChooseNextLane()
{
    UWorld* World = GetWorld();
    URoadNetworkSubsystem* Network = World ? World->GetSubsystem<URoadNetworkSubsystem>() : nullptr;
    if (!Network || !CurrentLane || CurrentLane->NextLaneIDs.IsEmpty())
    {
        TrafficState = ETrafficState::Recover;
        SpeedCmPerSecond = 0.0f;
        return;
    }
    TArray<ARoadLaneSpline*> Candidates;
    for (const FName ID : CurrentLane->NextLaneIDs)
        if (ARoadLaneSpline* Lane = Network->FindLane(ID); Lane && Lane->LaneSpline) Candidates.Add(Lane);
    if (Candidates.IsEmpty()) { TrafficState = ETrafficState::Recover; SpeedCmPerSecond = 0.0f; return; }
    CurrentLane = Candidates[FMath::RandHelper(Candidates.Num())];
    DistanceOnLaneCm = 0.0f;
    TrafficState = CurrentLane->bMergeLane ? ETrafficState::Merge : ETrafficState::Cruise;
    StateHoldSeconds = 0.0f;
}

void ATrafficVehicle::HandleOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
    if (Manager && OtherActor && !OtherActor->IsA<ATrafficVehicle>()) Manager->RecordTrafficOverlap(OtherActor);
}
