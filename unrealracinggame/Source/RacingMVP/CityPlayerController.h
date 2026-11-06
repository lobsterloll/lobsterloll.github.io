#pragma once

#include "GameFramework/PlayerController.h"
#include "CityPlayerController.generated.h"

class UInputMappingContext;
class UInputAction;
class UMaterialInterface;
class UStaticMesh;
class UStaticMeshComponent;

UCLASS()
class RACINGMVP_API ACityPlayerController : public APlayerController
{
    GENERATED_BODY()

protected:
    virtual void SetupInputComponent() override;
    virtual void OnPossess(APawn* InPawn) override;
    virtual void Tick(float DeltaSeconds) override;

private:
    void CycleCamera();
    void ApplyCameraMode();
    UStaticMeshComponent* CreateLamp(APawn* Vehicle, UStaticMesh* Mesh,
        UMaterialInterface* Material, const FVector& Location, const FVector& Scale);

    UPROPERTY()
    TObjectPtr<UInputMappingContext> DrivingKeys;

    UPROPERTY()
    TObjectPtr<UInputAction> CameraAction;

    UPROPERTY()
    TArray<TObjectPtr<UStaticMeshComponent>> BrakeLamps;

    UPROPERTY()
    TArray<TObjectPtr<UStaticMeshComponent>> ReverseLamps;

    int32 CameraMode = 0;

};
