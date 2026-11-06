#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "RacingDataAssets.generated.h"

class UCurveFloat;
class USoundBase;
class UNiagaraSystem;

/** P0 schemas only. Runtime consumers and cross-asset validation arrive in later phases. */
UCLASS(BlueprintType)
class RACINGMVP_API UVehicleSpecData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Body", meta=(ClampMin="500.0", Units="kg"))
    float MassKg = 1500.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Body", meta=(Units="cm"))
    FVector CenterOfMassOffsetCm = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Engine")
    TSoftObjectPtr<UCurveFloat> TorqueCurve;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Engine", meta=(ClampMin="1000.0", Units="rpm"))
    float MaxRPM = 6500.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Transmission")
    TArray<float> ForwardGearRatios;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Transmission", meta=(ClampMin="0.1"))
    float FinalDriveRatio = 3.5f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Brakes", meta=(ClampMin="0.0"))
    float BrakeTorqueNm = 4500.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Brakes", meta=(ClampMin="0.0"))
    float HandbrakeTorqueNm = 6000.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Steering")
    TSoftObjectPtr<UCurveFloat> SteeringSensitivityBySpeed;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Wheels", meta=(ClampMin="1.0", Units="cm"))
    float WheelRadiusCm = 34.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Wheels", meta=(ClampMin="0.01"))
    float TireFrictionScale = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Suspension", meta=(ClampMin="0.0"))
    float SpringRate = 250.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Suspension", meta=(ClampMin="0.0"))
    float DampingRatio = 0.5f;
};

UCLASS(BlueprintType)
class RACINGMVP_API URoadLaneData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Lane")
    FName LaneID;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Lane")
    FSoftObjectPath LaneSplineActor;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Connections")
    TArray<FName> NextLaneIDs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Connections")
    TArray<FName> AdjacentLaneIDs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Lane", meta=(ClampMin="1.0", Units="km/h"))
    float SpeedLimitKmh = 50.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Intersection", meta=(ClampMin="0.0", Units="m"))
    float StopLineDistanceM = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Tags")
    bool bSpawnLane = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Tags")
    bool bMergeLane = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Tags")
    bool bExitLane = false;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Tags")
    bool bSafeUTurn = false;
};

UCLASS(BlueprintType)
class RACINGMVP_API UTrafficTuningData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Pool", meta=(ClampMin="0", ClampMax="20"))
    int32 MaxTrafficVehicles = 20;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Pool", meta=(ClampMin="0", ClampMax="12"))
    int32 MaxNearVehicles = 8;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Distance", meta=(ClampMin="0.0", Units="m"))
    float NearDistanceM = 250.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Distance", meta=(ClampMin="0.0", Units="m"))
    float MidDistanceM = 650.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Distance", meta=(ClampMin="0.0", Units="m"))
    float DespawnDistanceM = 700.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Distance", meta=(ClampMin="0.0", Units="m"))
    float TierHysteresisM = 25.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Update", meta=(ClampMin="1.0"))
    float NearUpdateHz = 15.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Update", meta=(ClampMin="1.0"))
    float MidUpdateHz = 7.5f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Spacing", meta=(ClampMin="0.0", Units="m"))
    float MinimumFollowingDistanceM = 8.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Spacing", meta=(ClampMin="0.0", Units="m"))
    float SpawnClearanceAheadM = 30.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Spacing", meta=(ClampMin="0.0", Units="m"))
    float SpawnClearanceBehindM = 15.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Signals", meta=(ClampMin="0.0", Units="m"))
    float SignalBrakingMarginM = 5.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Lane Change", meta=(ClampMin="0.0", Units="s"))
    float LaneChangeCooldownS = 5.0f;
};

UCLASS(BlueprintType)
class RACINGMVP_API URaceData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Start")
    TArray<FTransform> StartTransforms;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Route")
    TArray<FSoftObjectPath> OrderedCheckpointActors;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Route")
    FSoftObjectPath FinishLineActor;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Route")
    FSoftObjectPath RacingLineActor;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="AI")
    TArray<TSoftObjectPtr<UVehicleSpecData>> AIVehicleSpecs;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="AI", meta=(ClampMin="0.1"))
    float NormalSpeedMultiplier = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="AI", meta=(ClampMin="1.0", Units="s"))
    float RecoveryTimeoutS = 15.0f;
};

USTRUCT(BlueprintType)
struct FRacingLineSample
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta=(ClampMin="0.0", Units="m"))
    float DistanceM = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    FVector WorldPosition = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta=(ClampMin="1.0", Units="km/h"))
    float RecommendedSpeedKmh = 80.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    bool bOvertakingAllowed = true;
};

UCLASS(BlueprintType)
class RACINGMVP_API URacingLineData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Line")
    TArray<FRacingLineSample> OrderedSamples;
};

USTRUCT(BlueprintType)
struct FSurfaceResponse
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly, meta=(ClampMin="0.01"))
    float FrictionScale = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TSoftObjectPtr<USoundBase> TireSound;

    UPROPERTY(EditAnywhere, BlueprintReadOnly)
    TSoftObjectPtr<UNiagaraSystem> TireVFX;
};

UCLASS(BlueprintType)
class RACINGMVP_API USurfaceTuningData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Surfaces")
    FSurfaceResponse Asphalt;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Surfaces")
    FSurfaceResponse Gravel;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Surfaces")
    FSurfaceResponse Grass;
};

UCLASS(BlueprintType)
class RACINGMVP_API UGraphicsPresetData : public UDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Display", meta=(ClampMin="640"))
    int32 OutputWidth = 1920;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Display", meta=(ClampMin="360"))
    int32 OutputHeight = 1080;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Display", meta=(ClampMin="50.0", ClampMax="100.0"))
    float ScreenPercentage = 83.3f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Display")
    bool bUseTSR = true;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Quality", meta=(ClampMin="0", ClampMax="4"))
    int32 ShadowQuality = 2;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Quality", meta=(ClampMin="0", ClampMax="4"))
    int32 TextureQuality = 2;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Quality", meta=(ClampMin="0", ClampMax="4"))
    int32 EffectsQuality = 2;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Quality", meta=(ClampMin="0", ClampMax="4"))
    int32 ReflectionQuality = 1;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Quality", meta=(ClampMin="0", ClampMax="4"))
    int32 FoliageQuality = 1;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Traffic", meta=(ClampMin="0", ClampMax="20"))
    int32 TrafficCap = 20;
};
