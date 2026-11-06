#include "Race/RaceManager.h"
#include "Race/RacingAIVehicle.h"
#include "Vehicle/RacingPlayerVehicle.h"
#include "RacingMVP.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
    constexpr float RaceLaneCenterY = 29250.0f;
    constexpr float RaceStartX = -41800.0f;
    constexpr float RaceTimeLimit = 180.0f;
}

ARaceManager::ARaceManager()
{
    PrimaryActorTick.bCanEverTick = true;
    OfferMarker = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("RaceOfferMarker"));
    SetRootComponent(OfferMarker);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Accent(TEXT("/Game/RacingMVP/World/Materials/M_OWDRacingAccent.M_OWDRacingAccent"));
    if (Cube.Succeeded()) OfferMarker->SetStaticMesh(Cube.Object);
    if (Accent.Succeeded()) OfferMarker->SetMaterial(0, Accent.Object);
    OfferMarker->SetWorldScale3D(FVector(1.2f, 1.2f, 3.0f));
    OfferMarker->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    GateXs = {-15000.0f, 10000.0f, 30000.0f, 43000.0f};
}

void ARaceManager::BeginPlay()
{
    Super::BeginPlay();
    SetActorLocation(OfferLocation);
    CreateGateVisuals();
#if !UE_BUILD_SHIPPING
    bAutoStartRequested = FParse::Param(FCommandLine::Get(), TEXT("P5AutoStart"));
#endif
    UE_LOG(LogRacingMVP, Display, TEXT("P5 sprint offer ready: marker=(%.0f,%.0f), checkpoints=3, finish=%.0f"),
        OfferLocation.X, OfferLocation.Y, GateXs.Last());
}

ARacingPlayerVehicle* ARaceManager::GetPlayerCar() const
{
    const APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
    return PC ? Cast<ARacingPlayerVehicle>(PC->GetPawn()) : nullptr;
}

void ARaceManager::CreateGateVisuals()
{
    UStaticMesh* Cube = OfferMarker ? OfferMarker->GetStaticMesh() : nullptr;
    if (!Cube) return;
    UMaterialInterface* Paint = OfferMarker->GetMaterial(0);
    for (int32 GateIndex = 0; GateIndex < GateXs.Num(); ++GateIndex)
    {
        for (int32 Piece = 0; Piece < 3; ++Piece)
        {
            UStaticMeshComponent* Part = NewObject<UStaticMeshComponent>(this);
            Part->SetStaticMesh(Cube);
            if (Paint) Part->SetMaterial(0, Paint);
            Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Part->SetupAttachment(OfferMarker);
            AddInstanceComponent(Part);
            Part->RegisterComponent();
            const FVector Position = Piece == 0 ? FVector(GateXs[GateIndex], 28100.0f, 400.0f)
                : (Piece == 1 ? FVector(GateXs[GateIndex], 30400.0f, 400.0f)
                    : FVector(GateXs[GateIndex], 29250.0f, 820.0f));
            Part->SetWorldLocation(Position);
            Part->SetWorldScale3D(Piece == 2 ? FVector(0.35f, 23.0f, 0.35f) : FVector(0.35f, 0.35f, 8.0f));
            Part->SetVisibility(false);
            GateVisuals.Add(Part);
        }
    }
}

void ARaceManager::SetGateVisibility(bool bVisible)
{
    for (UStaticMeshComponent* Part : GateVisuals) if (Part) Part->SetVisibility(bVisible);
}

void ARaceManager::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    ARacingPlayerVehicle* Player = GetPlayerCar();
    if (!Player) return;
    if (bAutoStartRequested && (Phase == ERacePhase::FreeDrive || Phase == ERacePhase::Offer))
    {
        bAutoStartRequested = false;
        StartRace();
        return;
    }
    if (Phase == ERacePhase::FreeDrive || Phase == ERacePhase::Offer)
    {
        const bool bNear = FVector::Dist2D(Player->GetActorLocation(), OfferLocation) < 2600.0f;
        Phase = bNear ? ERacePhase::Offer : ERacePhase::FreeDrive;
        return;
    }
    if (bRacePaused) return;
    if (Phase == ERacePhase::Countdown)
    {
        CountdownRemaining -= DeltaSeconds;
        if (CountdownRemaining <= 0.0f)
        {
            Phase = ERacePhase::Racing;
            CountdownRemaining = 0.0f;
            GoFlashRemaining = 1.0f;
            Player->SetRaceControlLocked(false);
            for (ARacingAIVehicle* AI : Opponents) if (AI) AI->SetRaceRunning(true);
            UE_LOG(LogRacingMVP, Display, TEXT("P5 race GO: player + %d Chaos opponents"), Opponents.Num());
        }
        return;
    }
    if (Phase != ERacePhase::Racing) return;
    GoFlashRemaining = FMath::Max(0.0f, GoFlashRemaining - DeltaSeconds);
    RaceElapsed += DeltaSeconds;
    for (FRaceParticipant& Participant : Participants) UpdateProgress(Participant);
    if (RaceElapsed >= RaceTimeLimit)
    {
        for (FRaceParticipant& Participant : Participants)
            if (Participant.FinishTime < 0.0f) Participant.bDNF = true;
        EnterResults();
        return;
    }
    if (!Participants.IsEmpty() && Participants[0].FinishTime >= 0.0f)
    {
        ResultWait += DeltaSeconds;
        bool bAllDone = true;
        for (const FRaceParticipant& Participant : Participants)
            bAllDone &= Participant.FinishTime >= 0.0f || Participant.bDNF;
        if (bAllDone || ResultWait >= 12.0f)
        {
            for (FRaceParticipant& Participant : Participants)
                if (Participant.FinishTime < 0.0f) Participant.bDNF = true;
            EnterResults();
        }
    }
}

void ARaceManager::UpdateProgress(FRaceParticipant& Participant)
{
    ARacingPlayerVehicle* Vehicle = Participant.Vehicle.Get();
    if (!Vehicle || Participant.FinishTime >= 0.0f || Participant.bDNF) return;
    const FVector Position = Vehicle->GetActorLocation();
    if (Participant.NextGate < GateXs.Num())
    {
        const float GateX = GateXs[Participant.NextGate];
        const bool bForwardCrossing = Participant.PreviousX < GateX && Position.X >= GateX
            && Position.X - Participant.PreviousX < 1200.0f && Vehicle->GetActorForwardVector().X > 0.35f;
        if (bForwardCrossing && FMath::Abs(Position.Y - RaceLaneCenterY) <= 1500.0f)
        {
            ++Participant.NextGate;
            UE_LOG(LogRacingMVP, Display, TEXT("P5 checkpoint: %s gate=%d/%d time=%.2f"),
                *Participant.DisplayName, Participant.NextGate, GateXs.Num(), RaceElapsed);
            if (Participant.NextGate == GateXs.Num())
            {
                Participant.FinishTime = RaceElapsed;
                if (ARacingAIVehicle* FinishedAI = Cast<ARacingAIVehicle>(Vehicle)) FinishedAI->SetRaceRunning(false);
                UE_LOG(LogRacingMVP, Display, TEXT("P5 finish: %s time=%.2f"), *Participant.DisplayName, RaceElapsed);
            }
            else if (Vehicle == GetPlayerCar())
            {
                Vehicle->SetRaceResetTransform(FTransform(FRotator::ZeroRotator,
                    FVector(GateX + 300.0f, RaceLaneCenterY, 180.0f)));
            }
        }
    }
    Participant.PreviousX = Position.X;
}

void ARaceManager::StartRace()
{
    ARacingPlayerVehicle* Player = GetPlayerCar();
    if (!Player || !GetWorld()) return;
    for (ARacingAIVehicle* AI : Opponents) if (AI) AI->Destroy();
    Opponents.Empty();
    Participants.Empty();
    bRacePaused = false;
    RaceElapsed = ResultWait = GoFlashRemaining = 0.0f;
    CountdownRemaining = 3.5f;
    Phase = ERacePhase::Countdown;
    Player->TeleportRaceVehicle(FTransform(FRotator::ZeroRotator, FVector(RaceStartX, RaceLaneCenterY, 180.0f)));
    Player->SetRaceResetTransform(Player->GetActorTransform());
    Player->SetRaceControlLocked(true);
    Participants.Add({Player, TEXT("YOU"), 0, RaceStartX, -1.0f, false});

    const float AILanes[] = {28750.0f, 29750.0f, 29250.0f};
    const float AISpeeds[] = {91.0f, 99.0f, 105.0f};
    for (int32 Index = 0; Index < 3; ++Index)
    {
        const float GridX = Index == 2 ? RaceStartX - 1000.0f : RaceStartX;
        const FTransform Grid(FRotator::ZeroRotator, FVector(GridX, AILanes[Index], 180.0f));
        ARacingAIVehicle* AI = GetWorld()->SpawnActor<ARacingAIVehicle>(ARacingAIVehicle::StaticClass(), Grid);
        if (!AI)
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P5 failed to spawn AI opponent %d"), Index + 1);
            continue;
        }
        AI->ConfigureRaceLine(AILanes[Index], AISpeeds[Index], Index);
        AI->SetRaceRunning(false);
        Opponents.Add(AI);
        Participants.Add({AI, FString::Printf(TEXT("RACER %d"), Index + 1), 0, GridX, -1.0f, false});
    }
    SetGateVisibility(true);
    UE_LOG(LogRacingMVP, Display, TEXT("P5 race countdown: participants=%d, checkpoints=3"), Participants.Num());
}

void ARaceManager::EnterResults()
{
    Phase = ERacePhase::Results;
    bRacePaused = false;
    if (ARacingPlayerVehicle* Player = GetPlayerCar()) Player->SetRaceControlLocked(true);
    for (ARacingAIVehicle* AI : Opponents) if (AI) AI->SetRaceRunning(false);
    UE_LOG(LogRacingMVP, Display, TEXT("P5 results: player_place=%d player_time=%.2f"),
        GetPlayerRank(), Participants.IsEmpty() ? -1.0f : Participants[0].FinishTime);
}

void ARaceManager::ReturnToFreeDrive()
{
    if (ARacingPlayerVehicle* Player = GetPlayerCar())
    {
        const FTransform Hub(FRotator::ZeroRotator, FVector(0.0f, -700.0f, 180.0f));
        Player->TeleportRaceVehicle(Hub);
        Player->SetRaceResetTransform(Hub);
        Player->SetRaceControlLocked(false);
    }
    for (ARacingAIVehicle* AI : Opponents) if (AI) AI->Destroy();
    Opponents.Empty();
    Participants.Empty();
    SetGateVisibility(false);
    bRacePaused = false;
    Phase = ERacePhase::FreeDrive;
    UE_LOG(LogRacingMVP, Display, TEXT("P5 returned to free drive"));
}

void ARaceManager::HandleInteract()
{
    if (Phase == ERacePhase::Results) { ReturnToFreeDrive(); return; }
    if (Phase == ERacePhase::Offer) StartRace();
}

void ARaceManager::HandlePause()
{
    if (Phase != ERacePhase::Countdown && Phase != ERacePhase::Racing) return;
    bRacePaused = !bRacePaused;
    if (ARacingPlayerVehicle* Player = GetPlayerCar()) Player->SetRaceControlLocked(bRacePaused || Phase == ERacePhase::Countdown);
    for (ARacingAIVehicle* AI : Opponents) if (AI) AI->SetRaceRunning(!bRacePaused && Phase == ERacePhase::Racing);
    UE_LOG(LogRacingMVP, Display, TEXT("P5 race pause=%d"), bRacePaused);
}

void ARaceManager::HandleRestart()
{
    if (Phase == ERacePhase::Countdown || Phase == ERacePhase::Racing || Phase == ERacePhase::Results)
    {
        UE_LOG(LogRacingMVP, Display, TEXT("P5 race restart"));
        StartRace();
    }
}

void ARaceManager::HandleLeave()
{
    if (Phase == ERacePhase::Countdown || Phase == ERacePhase::Racing || Phase == ERacePhase::Results)
        ReturnToFreeDrive();
}

int32 ARaceManager::GetPlayerCheckpointCount() const
{
    return Participants.IsEmpty() ? 0 : FMath::Min(Participants[0].NextGate, 3);
}

int32 ARaceManager::GetPlayerRank() const
{
    if (Participants.IsEmpty()) return 0;
    const FRaceParticipant& Player = Participants[0];
    int32 Rank = 1;
    for (int32 Index = 1; Index < Participants.Num(); ++Index)
    {
        const FRaceParticipant& Other = Participants[Index];
        if (Other.FinishTime >= 0.0f && (Player.FinishTime < 0.0f || Other.FinishTime < Player.FinishTime)) ++Rank;
        else if (Player.FinishTime < 0.0f && Other.FinishTime < 0.0f && !Other.bDNF)
        {
            const float OtherX = Other.Vehicle.IsValid() ? Other.Vehicle->GetActorLocation().X : Other.PreviousX;
            const float PlayerX = Player.Vehicle.IsValid() ? Player.Vehicle->GetActorLocation().X : Player.PreviousX;
            if (Other.NextGate > Player.NextGate || (Other.NextGate == Player.NextGate && OtherX > PlayerX)) ++Rank;
        }
    }
    return Rank;
}

TArray<FString> ARaceManager::GetResultLines() const
{
    TArray<FString> Lines;
    TArray<int32> Order;
    for (int32 Index = 0; Index < Participants.Num(); ++Index) Order.Add(Index);
    Order.Sort([this](int32 A, int32 B)
    {
        const FRaceParticipant& Left = Participants[A];
        const FRaceParticipant& Right = Participants[B];
        if (Left.FinishTime >= 0.0f && Right.FinishTime >= 0.0f) return Left.FinishTime < Right.FinishTime;
        if (Left.FinishTime >= 0.0f) return true;
        if (Right.FinishTime >= 0.0f) return false;
        if (Left.NextGate != Right.NextGate) return Left.NextGate > Right.NextGate;
        return Left.PreviousX > Right.PreviousX;
    });
    for (int32 Place = 0; Place < Order.Num(); ++Place)
    {
        const FRaceParticipant& Participant = Participants[Order[Place]];
        const FString Time = Participant.FinishTime >= 0.0f
            ? FString::Printf(TEXT("%.2f s"), Participant.FinishTime) : TEXT("DNF");
        Lines.Add(FString::Printf(TEXT("%d. %s  %s"), Place + 1, *Participant.DisplayName, *Time));
    }
    return Lines;
}
