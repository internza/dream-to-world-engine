# Diagram Descriptions

This section explains the conventions and structure used in the Level 0, Level 1, and Level 2 design diagrams for the Dream to World Engine. Each diagram shows a different layer of detail in the system and highlights how user input becomes a complete three dimensional scene.

## Conventions Used
Rectangles represent system modules or functional components.  
Arrows represent the flow of information between modules.  
Labels indicate the type of data each connection carries.  
The left side of each diagram represents user input.  
The right side represents world generation and rendering.  
Higher levels show more detail but follow the same overall flow.

## Level 0 Diagram Description
The Level 0 diagram shows the largest view of the system. It begins with the user entering a natural language prompt. The input passes into the processing layer which extracts meaning and identifies the elements needed in the scene. The world model layer organizes this information into a structured representation. The rendering layer turns that model into a three dimensional scene the user can explore. This level focuses on the full system from input to output with no internal detail.

## Level 1 Diagram Description
The Level 1 diagram expands the processing and world model modules. The input handling step separates text parsing from prompt interpretation. The interpreter identifies objects, relationships, and scene properties. The world model module is divided into placement logic, object definitions, and scene structure. Rendering is shown as a combination of model loading, lighting setup, and camera behavior. This level shows how the main path is divided into functional blocks.

## Level 2 Diagram Description
The Level 2 diagram breaks down the world model and rendering pipeline into more detailed components. Object identification feeds attribute extraction, which then connects to placement rules. These rules generate a structured scene graph. The rendering layer pulls data from the scene graph and handles mesh selection, material setup, shadows, and navigation controls. This view highlights how the system organizes data and how each stage prepares information for the next.

These descriptions support the diagrams by explaining the role and purpose of each part of the system.
