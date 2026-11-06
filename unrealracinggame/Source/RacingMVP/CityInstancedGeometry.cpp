#include "CityInstancedGeometry.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/SceneComponent.h"

ACityInstancedGeometry::ACityInstancedGeometry()
{
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    Root->SetMobility(EComponentMobility::Static);
    RootComponent = Root;
}

void ACityInstancedGeometry::AddPiece(FName Group, UStaticMesh* Mesh,
    UMaterialInterface* Material, FVector Position, FRotator Rotation,
    FVector Size, bool bCollision)
{
    if (!Mesh || !Material)
    {
        return;
    }

    TObjectPtr<UHierarchicalInstancedStaticMeshComponent>* Found = Groups.Find(Group);
    UHierarchicalInstancedStaticMeshComponent* Instances = Found ? Found->Get() : nullptr;
    if (!Instances)
    {
        Instances = NewObject<UHierarchicalInstancedStaticMeshComponent>(this, Group);
        Instances->CreationMethod = EComponentCreationMethod::Instance;
        Instances->SetMobility(EComponentMobility::Static);
        Instances->SetStaticMesh(Mesh);
        Instances->SetMaterial(0, Material);
        Instances->bOverrideLightMapRes = true;
        Instances->OverriddenLightMapRes = bCollision ? 32 : 8;
        Instances->SetCollisionEnabled(bCollision
            ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
        Instances->SetCastShadow(bCollision);
        Instances->SetAffectDistanceFieldLighting(bCollision);
        Instances->SetupAttachment(RootComponent);
        AddInstanceComponent(Instances);
        Instances->RegisterComponent();
        Groups.Add(Group, Instances);
    }

    Instances->AddInstance(FTransform(Rotation, Position, Size / 100.0f));
}

void ACityInstancedGeometry::AddRoadEdge(FVector Start, FVector End)
{
    RoadEdges.Add(Start);
    RoadEdges.Add(End);
}

int32 ACityInstancedGeometry::AddLane(FVector Start, FVector End, float SpeedLimitKmh,
    int32 SignalId, int32 SignalAxis)
{
    FCityRoadLane& Lane = Lanes.AddDefaulted_GetRef();
    Lane.Id = Lanes.Num() - 1;
    Lane.Start = Start;
    Lane.End = End;
    Lane.SpeedLimitKmh = SpeedLimitKmh;
    Lane.SignalId = SignalId;
    Lane.SignalAxis = SignalAxis;
    return Lane.Id;
}

void ACityInstancedGeometry::ConnectLanes(int32 FromId, int32 ToId)
{
    if (Lanes.IsValidIndex(FromId) && Lanes.IsValidIndex(ToId))
    {
        Lanes[FromId].NextLanes.AddUnique(ToId);
    }
}

void ACityInstancedGeometry::SetMapBounds(FVector2D Min, FVector2D Max)
{
    MapMin = Min;
    MapMax = Max;
}

void ACityInstancedGeometry::BeginPlay()
{
    Super::BeginPlay();

    int32 BadReferences = 0;
    for (const FCityRoadLane& Lane : Lanes)
    {
        if (Lane.Id < 0 || !Lanes.IsValidIndex(Lane.Id) ||
            FVector::DistSquared(Lane.Start, Lane.End) < FMath::Square(100.0f) ||
            Lane.NextLanes.IsEmpty())
        {
            ++BadReferences;
        }
        for (int32 NextId : Lane.NextLanes)
        {
            if (!Lanes.IsValidIndex(NextId))
            {
                ++BadReferences;
            }
        }
    }

    TSet<int32> Reached;
    TArray<int32> Pending;
    if (!Lanes.IsEmpty())
    {
        Pending.Add(0);
    }
    while (!Pending.IsEmpty())
    {
        const int32 Id = Pending.Pop(EAllowShrinking::No);
        if (Reached.Contains(Id))
        {
            continue;
        }
        Reached.Add(Id);
        for (int32 NextId : Lanes[Id].NextLanes)
        {
            if (Lanes.IsValidIndex(NextId) && !Reached.Contains(NextId))
            {
                Pending.Add(NextId);
            }
        }
    }
    UE_LOG(LogTemp, Display, TEXT("City roads: %d lanes, %d edges, %d reachable, %d invalid references"),
        Lanes.Num(), RoadEdges.Num() / 2, Reached.Num(), BadReferences);
    if (BadReferences || Reached.Num() != Lanes.Num())
    {
        UE_LOG(LogTemp, Error, TEXT("City road network failed validation"));
    }
}
