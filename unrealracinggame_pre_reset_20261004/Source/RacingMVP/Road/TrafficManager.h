#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TrafficManager.generated.h"

class ARoadLaneSpline;
class ATrafficVehicle;
class APawn;

UCLASS()
class RACINGMVP_API ATrafficManager : public AActor
{
    GENERATED_BODY()

public:
    ATrafficManager();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    const TArray<TObjectPtr<ATrafficVehicle>>& GetTrafficVehicles() const { return TrafficVehicles; }
    void RecordTrafficOverlap(const AActor* OtherActor);

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Traffic", meta=(ClampMin="0", ClampMax="20"))
    int32 MaxTrafficVehicles = 20;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Traffic")
    int32 TrafficOverlapCount = 0;

private:
    void TryInitializePool();
    bool PlaceVehicleNearPlayer(ATrafficVehicle* Vehicle, const APawn* Player, const TArray<FVector>& OccupiedLocations);
    void UpdateTrafficGrades(const APawn* Player);
    void LogTrafficHealth();

    UPROPERTY(Transient)
    TArray<TObjectPtr<ATrafficVehicle>> TrafficVehicles;

    float InitializeRetrySeconds = 0.0f;
    float GradeUpdateSeconds = 0.0f;
    float HealthLogSeconds = 0.0f;
    float PoolRecycleSeconds = 0.0f;
    bool bPoolInitialized = false;
    int32 PoolRecycleCount = 0;
};
