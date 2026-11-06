#include "TrafficSignalController.h"
#include "Components/PointLightComponent.h"

ATrafficSignalController::ATrafficSignalController()
{
    PrimaryActorTick.bCanEverTick = true;
    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SignalRoot"));
    SetRootComponent(SceneRoot);

    auto MakeLamp = [this](const TCHAR* Name, const FLinearColor& Color, const FVector& Position)
    {
        UPointLightComponent* Lamp = CreateDefaultSubobject<UPointLightComponent>(FName(Name));
        Lamp->SetupAttachment(SceneRoot);
        Lamp->SetRelativeLocation(Position);
        Lamp->SetLightColor(Color);
        Lamp->SetIntensity(900.0f);
        Lamp->SetAttenuationRadius(450.0f);
        Lamp->SetCastShadows(false);
        Lamp->SetVisibility(false);
        return Lamp;
    };

    EastWestRed = MakeLamp(TEXT("EastWestRed"), FLinearColor(1.0f, 0.025f, 0.01f), FVector(-180, -170, 480));
    EastWestYellow = MakeLamp(TEXT("EastWestYellow"), FLinearColor(1.0f, 0.42f, 0.015f), FVector(-180, -170, 480));
    EastWestGreen = MakeLamp(TEXT("EastWestGreen"), FLinearColor(0.02f, 1.0f, 0.12f), FVector(-180, -170, 480));
    NorthSouthRed = MakeLamp(TEXT("NorthSouthRed"), FLinearColor(1.0f, 0.025f, 0.01f), FVector(180, 170, 480));
    NorthSouthYellow = MakeLamp(TEXT("NorthSouthYellow"), FLinearColor(1.0f, 0.42f, 0.015f), FVector(180, 170, 480));
    NorthSouthGreen = MakeLamp(TEXT("NorthSouthGreen"), FLinearColor(0.02f, 1.0f, 0.12f), FVector(180, 170, 480));
    UpdateSignalHeads();
}

void ATrafficSignalController::SetPhaseLaneIDs(const TArray<FName>& InEastWestLaneIDs, const TArray<FName>& InNorthSouthLaneIDs)
{
    EastWestLaneIDs = InEastWestLaneIDs;
    NorthSouthLaneIDs = InNorthSouthLaneIDs;
}

void ATrafficSignalController::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    PhaseElapsed += DeltaSeconds;

    float PhaseDuration = GreenSeconds;
    if (Phase == EPhase::EastWestYellow || Phase == EPhase::NorthSouthYellow) PhaseDuration = YellowSeconds;
    else if (Phase == EPhase::AllRedToNorthSouth || Phase == EPhase::AllRedToEastWest) PhaseDuration = 1.0f;
    if (PhaseElapsed < PhaseDuration) return;

    PhaseElapsed = 0.0f;
    switch (Phase)
    {
    case EPhase::EastWestGreen: Phase = EPhase::EastWestYellow; break;
    case EPhase::EastWestYellow: Phase = EPhase::AllRedToNorthSouth; break;
    case EPhase::AllRedToNorthSouth: Phase = EPhase::NorthSouthGreen; break;
    case EPhase::NorthSouthGreen: Phase = EPhase::NorthSouthYellow; break;
    case EPhase::NorthSouthYellow: Phase = EPhase::AllRedToEastWest; break;
    default: Phase = EPhase::EastWestGreen; break;
    }
    UpdateSignalHeads();
}

ERoadSignalState ATrafficSignalController::GetStateForLane(FName LaneID) const
{
    if (EastWestLaneIDs.Contains(LaneID))
    {
        if (Phase == EPhase::EastWestGreen) return ERoadSignalState::Green;
        if (Phase == EPhase::EastWestYellow) return ERoadSignalState::Yellow;
        return ERoadSignalState::Red;
    }
    if (NorthSouthLaneIDs.Contains(LaneID))
    {
        if (Phase == EPhase::NorthSouthGreen) return ERoadSignalState::Green;
        if (Phase == EPhase::NorthSouthYellow) return ERoadSignalState::Yellow;
    }
    return ERoadSignalState::Red;
}

void ATrafficSignalController::UpdateSignalHeads()
{
    const bool bEWGreen = Phase == EPhase::EastWestGreen;
    const bool bEWYellow = Phase == EPhase::EastWestYellow;
    const bool bNSGreen = Phase == EPhase::NorthSouthGreen;
    const bool bNSYellow = Phase == EPhase::NorthSouthYellow;
    EastWestRed->SetVisibility(!bEWGreen && !bEWYellow);
    EastWestYellow->SetVisibility(bEWYellow);
    EastWestGreen->SetVisibility(bEWGreen);
    NorthSouthRed->SetVisibility(!bNSGreen && !bNSYellow);
    NorthSouthYellow->SetVisibility(bNSYellow);
    NorthSouthGreen->SetVisibility(bNSGreen);
}
