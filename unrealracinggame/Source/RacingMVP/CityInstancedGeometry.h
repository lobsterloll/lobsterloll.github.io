#pragma once

#include "GameFramework/Actor.h"
#include "CityInstancedGeometry.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;

USTRUCT(BlueprintType)
struct FCityRoadLane
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 Id = INDEX_NONE;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FVector Start = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    FVector End = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    TArray<int32> NextLanes;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    float SpeedLimitKmh = 50.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 SignalId = INDEX_NONE;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    int32 SignalAxis = INDEX_NONE;
};

UCLASS()
class RACINGMVP_API ACityInstancedGeometry : public AActor
{
    GENERATED_BODY()

public:
    ACityInstancedGeometry();

    UFUNCTION(BlueprintCallable, CallInEditor, Category="City")
    void AddPiece(FName Group, UStaticMesh* Mesh, UMaterialInterface* Material,
                  FVector Position, FRotator Rotation, FVector Size, bool bCollision);

    UFUNCTION(BlueprintCallable, CallInEditor, Category="City")
    void AddRoadEdge(FVector Start, FVector End);

    UFUNCTION(BlueprintCallable, CallInEditor, Category="City")
    int32 AddLane(FVector Start, FVector End, float SpeedLimitKmh,
                  int32 SignalId, int32 SignalAxis);

    UFUNCTION(BlueprintCallable, CallInEditor, Category="City")
    void ConnectLanes(int32 FromId, int32 ToId);

    UFUNCTION(BlueprintCallable, CallInEditor, Category="City")
    void SetMapBounds(FVector2D Min, FVector2D Max);

    const TArray<FVector>& GetRoadEdges() const { return RoadEdges; }
    const TArray<FCityRoadLane>& GetLanes() const { return Lanes; }
    FVector2D GetMapMin() const { return MapMin; }
    FVector2D GetMapMax() const { return MapMax; }

protected:
    virtual void BeginPlay() override;

private:
    TMap<FName, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Groups;

    UPROPERTY(VisibleAnywhere, Category="City")
    TArray<FVector> RoadEdges;

    UPROPERTY(VisibleAnywhere, Category="City")
    TArray<FCityRoadLane> Lanes;

    UPROPERTY(VisibleAnywhere, Category="City")
    FVector2D MapMin = FVector2D(-50000, -50000);

    UPROPERTY(VisibleAnywhere, Category="City")
    FVector2D MapMax = FVector2D(50000, 50000);
};
