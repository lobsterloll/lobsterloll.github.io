#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RoadLaneSpline.generated.h"

class USplineComponent;

UCLASS()
class RACINGMVP_API ARoadLaneSpline : public AActor
{
    GENERATED_BODY()

public:
    ARoadLaneSpline();

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Road")
    TObjectPtr<USplineComponent> LaneSpline;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Identity")
    FName LaneID;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Identity")
    FName StartNodeID;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Identity")
    FName EndNodeID;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Connections")
    TArray<FName> NextLaneIDs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Connections")
    TArray<FName> AdjacentLaneIDs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Rules", meta=(ClampMin="1.0", Units="km/h"))
    float SpeedLimitKmh = 50.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Rules", meta=(ClampMin="0.0", Units="m"))
    float StopLineDistanceM = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Rules")
    bool bSpawnLane = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Rules")
    bool bMergeLane = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Rules")
    bool bExitLane = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Road|Rules")
    bool bSafeUTurn = false;

    UFUNCTION(BlueprintCallable, Category="Road|Rules")
    void SetLaneTags(bool bInSpawnLane, bool bInMergeLane, bool bInExitLane, bool bInSafeUTurn);
};
