#pragma once

#include "GameFramework/Actor.h"
#include "CityTrafficSignal.generated.h"

class UStaticMeshComponent;

UCLASS()
class RACINGMVP_API ACityTrafficSignal : public AActor
{
    GENERATED_BODY()

public:
    ACityTrafficSignal();
    virtual void Tick(float DeltaSeconds) override;

    UPROPERTY(EditAnywhere, Category="Signal")
    int32 Axis = 0;

    UPROPERTY(EditAnywhere, Category="Signal")
    float PhaseOffset = 0.0f;

private:
    UPROPERTY()
    TArray<TObjectPtr<UStaticMeshComponent>> LitLenses;
};
