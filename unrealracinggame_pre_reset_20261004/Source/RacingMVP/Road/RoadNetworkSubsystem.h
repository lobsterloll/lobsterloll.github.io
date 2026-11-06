#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "RoadNetworkSubsystem.generated.h"

class ARoadLaneSpline;
class ATrafficSignalController;

UCLASS()
class RACINGMVP_API URoadNetworkSubsystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void OnWorldBeginPlay(UWorld& InWorld) override;

    const TArray<TObjectPtr<ARoadLaneSpline>>& GetLanes() const { return Lanes; }
    ARoadLaneSpline* FindLane(FName LaneID) const;
    bool ValidateNetwork();

private:
    UPROPERTY(Transient)
    TArray<TObjectPtr<ARoadLaneSpline>> Lanes;

    UPROPERTY(Transient)
    TArray<TObjectPtr<ATrafficSignalController>> Signals;

    TMap<FName, TObjectPtr<ARoadLaneSpline>> LaneByID;
};
