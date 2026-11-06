#include "CityTrafficSignal.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

ACityTrafficSignal::ACityTrafficSignal()
{
    PrimaryActorTick.bCanEverTick = true;
    RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Steel(
        TEXT("/Game/Materials/M_CitySteel.M_CitySteel"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Dark(
        TEXT("/Game/Materials/M_CityDarkStone.M_CityDarkStone"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Red(
        TEXT("/Game/Materials/M_TrafficRed.M_TrafficRed"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Amber(
        TEXT("/Game/Materials/M_TrafficAmber.M_TrafficAmber"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Green(
        TEXT("/Game/Materials/M_TrafficGreen.M_TrafficGreen"));

    UStaticMeshComponent* Pole = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Pole"));
    Pole->SetupAttachment(RootComponent);
    Pole->SetStaticMesh(Cylinder.Object);
    Pole->SetMaterial(0, Steel.Object);
    Pole->SetRelativeLocation(FVector(0, 0, 325));
    Pole->SetRelativeScale3D(FVector(0.36f, 0.36f, 6.5f));
    Pole->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

    UStaticMeshComponent* Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SignalBody"));
    Body->SetupAttachment(RootComponent);
    Body->SetStaticMesh(Cube.Object);
    Body->SetMaterial(0, Dark.Object);
    Body->SetRelativeLocation(FVector(0, 0, 685));
    Body->SetRelativeScale3D(FVector(0.8f, 0.8f, 2.7f));
    Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    UMaterialInterface* Colors[] = {Red.Object, Amber.Object, Green.Object};
    const TCHAR* Names[] = {TEXT("Red"), TEXT("Amber"), TEXT("Green")};
    for (int32 Index = 0; Index < 3; ++Index)
    {
        const float Height = 770.0f - Index * 85.0f;
        UStaticMeshComponent* DarkLens = CreateDefaultSubobject<UStaticMeshComponent>(
            *FString::Printf(TEXT("%sDarkLens"), Names[Index]));
        DarkLens->SetupAttachment(RootComponent);
        DarkLens->SetStaticMesh(Sphere.Object);
        DarkLens->SetMaterial(0, Dark.Object);
        DarkLens->SetRelativeLocation(FVector(46, 0, Height));
        DarkLens->SetRelativeScale3D(FVector(0.16f, 0.56f, 0.56f));
        DarkLens->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        DarkLens->SetCastShadow(false);

        UStaticMeshComponent* LitLens = CreateDefaultSubobject<UStaticMeshComponent>(
            *FString::Printf(TEXT("%sLitLens"), Names[Index]));
        LitLens->SetupAttachment(RootComponent);
        LitLens->SetStaticMesh(Sphere.Object);
        LitLens->SetMaterial(0, Colors[Index]);
        LitLens->SetRelativeLocation(FVector(52, 0, Height));
        LitLens->SetRelativeScale3D(FVector(0.08f, 0.48f, 0.48f));
        LitLens->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        LitLens->SetCastShadow(false);
        LitLens->SetVisibility(Index == 0);
        LitLenses.Add(LitLens);
    }
}

void ACityTrafficSignal::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    const float Time = FMath::Fmod(GetWorld()->GetTimeSeconds() + PhaseOffset, 32.0f);
    int32 Active = 0;
    if (Axis == 0)
    {
        Active = Time < 12.0f ? 2 : Time < 15.0f ? 1 : 0;
    }
    else if (Time >= 16.0f && Time < 31.0f)
    {
        Active = Time < 28.0f ? 2 : 1;
    }
    for (int32 Index = 0; Index < LitLenses.Num(); ++Index)
    {
        LitLenses[Index]->SetVisibility(Index == Active);
    }
}
