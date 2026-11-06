#include "P3CityInstanceLayer.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

AP3CityInstanceLayer::AP3CityInstanceLayer()
{
    PrimaryActorTick.bCanEverTick = false;
    Instances = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Instances"));
    SetRootComponent(Instances);
    Instances->SetMobility(EComponentMobility::Static);
    Instances->SetGenerateOverlapEvents(false);
}

void AP3CityInstanceLayer::ConfigureLayer(UStaticMesh* Mesh, UMaterialInterface* Material, UPhysicalMaterial* PhysicalMaterial, bool bBlockVehicles)
{
    Instances->SetStaticMesh(Mesh);
    Instances->SetMaterial(0, Material);
    Instances->SetPhysMaterialOverride(PhysicalMaterial);
    Instances->SetCollisionEnabled(bBlockVehicles ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
    Instances->SetCollisionProfileName(bBlockVehicles ? TEXT("BlockAll") : TEXT("NoCollision"));
}

int32 AP3CityInstanceLayer::AddWorldInstance(FVector Location, FRotator Rotation, FVector Scale)
{
    return Instances->AddInstance(FTransform(Rotation, Location, Scale), true);
}
