#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TrafficSignalController.generated.h"

class UPointLightComponent;

UENUM(BlueprintType)
enum class ERoadSignalState : uint8
{
    Red,
    Yellow,
    Green
};

UCLASS()
class RACINGMVP_API ATrafficSignalController : public AActor
{
    GENERATED_BODY()

public:
    ATrafficSignalController();
    virtual void Tick(float DeltaSeconds) override;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signal")
    FName SignalID;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signal")
    FName IntersectionNodeID;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signal|Movements")
    TArray<FName> EastWestLaneIDs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signal|Movements")
    TArray<FName> NorthSouthLaneIDs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signal|Timing", meta=(ClampMin="5.0", Units="s"))
    float GreenSeconds = 16.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signal|Timing", meta=(ClampMin="2.0", Units="s"))
    float YellowSeconds = 3.0f;

    ERoadSignalState GetStateForLane(FName LaneID) const;
    void SetPhaseLaneIDs(const TArray<FName>& InEastWestLaneIDs, const TArray<FName>& InNorthSouthLaneIDs);

private:
    enum class EPhase : uint8 { EastWestGreen, EastWestYellow, AllRedToNorthSouth, NorthSouthGreen, NorthSouthYellow, AllRedToEastWest };

    UPROPERTY()
    TObjectPtr<USceneComponent> SceneRoot;

    UPROPERTY()
    TObjectPtr<UPointLightComponent> EastWestRed;

    UPROPERTY()
    TObjectPtr<UPointLightComponent> EastWestYellow;

    UPROPERTY()
    TObjectPtr<UPointLightComponent> EastWestGreen;

    UPROPERTY()
    TObjectPtr<UPointLightComponent> NorthSouthRed;

    UPROPERTY()
    TObjectPtr<UPointLightComponent> NorthSouthYellow;

    UPROPERTY()
    TObjectPtr<UPointLightComponent> NorthSouthGreen;

    EPhase Phase = EPhase::EastWestGreen;
    float PhaseElapsed = 0.0f;

    void UpdateSignalHeads();
};
