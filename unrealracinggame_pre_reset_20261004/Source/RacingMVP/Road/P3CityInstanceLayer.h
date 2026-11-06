#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "P3CityInstanceLayer.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UPhysicalMaterial;

UCLASS()
class RACINGMVP_API AP3CityInstanceLayer : public AActor
{
    GENERATED_BODY()

public:
    AP3CityInstanceLayer();

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Instances")
    TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Instances;

    UFUNCTION(BlueprintCallable, CallInEditor, Category="Instances")
    void ConfigureLayer(UStaticMesh* Mesh, UMaterialInterface* Material, UPhysicalMaterial* PhysicalMaterial, bool bBlockVehicles);

    UFUNCTION(BlueprintCallable, CallInEditor, Category="Instances")
    int32 AddWorldInstance(FVector Location, FRotator Rotation, FVector Scale);
};
