#include "RoadLaneSpline.h"
#include "Components/SplineComponent.h"

ARoadLaneSpline::ARoadLaneSpline()
{
    PrimaryActorTick.bCanEverTick = false;
    LaneSpline = CreateDefaultSubobject<USplineComponent>(TEXT("LaneSpline"));
    SetRootComponent(LaneSpline);
    LaneSpline->SetDrawDebug(false);
}

void ARoadLaneSpline::SetLaneTags(bool bInSpawnLane, bool bInMergeLane, bool bInExitLane, bool bInSafeUTurn)
{
    bSpawnLane = bInSpawnLane;
    bMergeLane = bInMergeLane;
    bExitLane = bInExitLane;
    bSafeUTurn = bInSafeUTurn;
}
