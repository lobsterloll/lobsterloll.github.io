#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TrafficVehicle.generated.h"

class ARoadLaneSpline;
class ATrafficManager;
class UBoxComponent;
class USkeletalMeshComponent;

UENUM(BlueprintType)
enum class ETrafficState : uint8
{
    Cruise,
    Follow,
    ApproachLight,
    StopAtLight,
    Wait,
    ChangeLane,
    Merge,
    Recover
};

UENUM(BlueprintType)
enum class ETrafficSimulationGrade : uint8
{
    Near,
    Mid,
    Far,
    Pooled
};

UCLASS()
class RACINGMVP_API ATrafficVehicle : public AActor
{
    GENERATED_BODY()

public:
    ATrafficVehicle();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    void InitializeTraffic(ATrafficManager* InManager, ARoadLaneSpline* InLane, float InDistanceCm);
    void SetSimulationGrade(ETrafficSimulationGrade NewGrade);

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Traffic")
    TObjectPtr<USkeletalMeshComponent> VehicleVisual;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Traffic")
    TObjectPtr<UBoxComponent> TrafficOverlap;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Traffic")
    TObjectPtr<ARoadLaneSpline> CurrentLane;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Traffic")
    ETrafficState TrafficState = ETrafficState::Cruise;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Traffic")
    ETrafficSimulationGrade SimulationGrade = ETrafficSimulationGrade::Near;

    float GetDistanceOnLane() const { return DistanceOnLaneCm; }
    float GetSpeedCmPerSecond() const { return SpeedCmPerSecond; }
    bool IsTrafficActive() const { return bTrafficActive; }
    void SetTrafficActive(bool bActive);

private:
    void UpdateTrafficBrain(float DeltaSeconds);
    void UpdateLanePosition(float DeltaSeconds);
    void ChooseNextLane();
    UFUNCTION()
    void HandleOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor,
        UPrimitiveComponent* OtherComponent, int32 OtherBodyIndex, bool bFromSweep,
        const FHitResult& SweepResult);

    UPROPERTY(Transient)
    TObjectPtr<ATrafficManager> Manager;

    float DistanceOnLaneCm = 0.0f;
    float SpeedCmPerSecond = 0.0f;
    float TargetSpeedCmPerSecond = 0.0f;
    float BrainAccumulator = 0.0f;
    float StateHoldSeconds = 0.0f;
    bool bTrafficActive = true;
};
