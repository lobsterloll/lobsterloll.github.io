#include "RoadNetworkSubsystem.h"
#include "RoadLaneSpline.h"
#include "TrafficSignalController.h"
#include "TrafficManager.h"
#include "RacingMVP.h"
#include "Components/SplineComponent.h"
#include "EngineUtils.h"
#include "Engine/World.h"

void URoadNetworkSubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
    Super::OnWorldBeginPlay(InWorld);
    Lanes.Reset();
    Signals.Reset();
    LaneByID.Reset();

    for (TActorIterator<ARoadLaneSpline> It(&InWorld); It; ++It)
    {
        ARoadLaneSpline* Lane = *It;
        Lanes.Add(Lane);
        if (Lane->LaneID.IsNone())
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P3 road lane has no ID: %s"), *GetNameSafe(Lane));
            continue;
        }
        if (LaneByID.Contains(Lane->LaneID))
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P3 duplicate lane ID: %s"), *Lane->LaneID.ToString());
            continue;
        }
        LaneByID.Add(Lane->LaneID, Lane);
    }
    for (TActorIterator<ATrafficSignalController> It(&InWorld); It; ++It) Signals.Add(*It);
    ValidateNetwork();

    if (!Lanes.IsEmpty())
    {
        bool bManagerExists = false;
        for (TActorIterator<ATrafficManager> It(&InWorld); It; ++It)
        {
            bManagerExists = true;
            break;
        }
        if (!bManagerExists)
        {
            InWorld.SpawnActor<ATrafficManager>(ATrafficManager::StaticClass(), FTransform::Identity);
        }
    }
}

ARoadLaneSpline* URoadNetworkSubsystem::FindLane(FName LaneID) const
{
    const TObjectPtr<ARoadLaneSpline>* Found = LaneByID.Find(LaneID);
    return Found ? Found->Get() : nullptr;
}

bool URoadNetworkSubsystem::ValidateNetwork()
{
    bool bValid = Lanes.Num() > 0;
    int32 ConnectionCount = 0;
    for (ARoadLaneSpline* Lane : Lanes)
    {
        if (!Lane || !Lane->LaneSpline || Lane->LaneID.IsNone()) { bValid = false; continue; }
        if (Lane->LaneSpline->GetNumberOfSplinePoints() < 2 || Lane->LaneSpline->GetSplineLength() < 500.0f)
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P3 lane %s has a missing/short spline."), *Lane->LaneID.ToString());
            bValid = false;
        }
        if (Lane->StartNodeID.IsNone() || Lane->EndNodeID.IsNone())
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P3 lane %s has an undefined endpoint node."), *Lane->LaneID.ToString());
            bValid = false;
        }
        if (Lane->NextLaneIDs.IsEmpty() && !Lane->bSafeUTurn)
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P3 lane %s ends without a connection or safe U-turn."), *Lane->LaneID.ToString());
            bValid = false;
        }
        for (const FName NextID : Lane->NextLaneIDs)
        {
            const ARoadLaneSpline* Next = FindLane(NextID);
            if (!Next)
            {
                UE_LOG(LogRacingMVP, Error, TEXT("P3 lane %s references missing lane %s."), *Lane->LaneID.ToString(), *NextID.ToString());
                bValid = false;
                continue;
            }
            ++ConnectionCount;
            if (Lane->EndNodeID != Next->StartNodeID)
            {
                UE_LOG(LogRacingMVP, Error, TEXT("P3 connection %s -> %s joins different nodes (%s -> %s)."),
                    *Lane->LaneID.ToString(), *Next->LaneID.ToString(), *Lane->EndNodeID.ToString(), *Next->StartNodeID.ToString());
                bValid = false;
            }
        }
    }

    for (const ATrafficSignalController* Signal : Signals)
    {
        if (!Signal || Signal->SignalID.IsNone() || Signal->IntersectionNodeID.IsNone())
        {
            UE_LOG(LogRacingMVP, Error, TEXT("P3 traffic signal is missing identity/node."));
            bValid = false;
            continue;
        }
        for (const FName LaneID : Signal->EastWestLaneIDs)
        {
            if (!FindLane(LaneID)) { UE_LOG(LogRacingMVP, Error, TEXT("P3 signal %s references missing lane %s."), *Signal->SignalID.ToString(), *LaneID.ToString()); bValid = false; }
            if (Signal->NorthSouthLaneIDs.Contains(LaneID)) { UE_LOG(LogRacingMVP, Error, TEXT("P3 signal %s gives lane %s conflicting simultaneous phases."), *Signal->SignalID.ToString(), *LaneID.ToString()); bValid = false; }
        }
        for (const FName LaneID : Signal->NorthSouthLaneIDs)
        {
            if (!FindLane(LaneID)) { UE_LOG(LogRacingMVP, Error, TEXT("P3 signal %s references missing lane %s."), *Signal->SignalID.ToString(), *LaneID.ToString()); bValid = false; }
        }
    }

    if (bValid)
    {
        UE_LOG(LogRacingMVP, Display, TEXT("P3 road graph valid: lanes=%d connections=%d signals=%d"), Lanes.Num(), ConnectionCount, Signals.Num());
    }
    return bValid;
}
