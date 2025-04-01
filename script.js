document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables & Constants ---
    const bubbleContainer = document.getElementById('bubble-container');
    const addBubbleBtn = document.getElementById('add-bubble-btn');
    const changeThemeBtn = document.getElementById('change-theme-btn');
    const exportMdBtn = document.getElementById('export-md-btn');
    const importMdInput = document.getElementById('import-md-input');
    const importMdLabel = document.querySelector('label[for="import-md-input"]'); // For potential styling
    const clearAllBtn = document.getElementById('clear-all-btn');
    const rootStyle = document.documentElement.style;

    let bubbles = []; // Main data store
    let draggedBubble = null;
    let resizingBubble = null;
    let initialX, initialY, initialWidth, initialHeight, initialAspect, offsetX, offsetY;
    let stickDistance = 70; // Increased distance for easier sticking detection
    let hoverTimeout = null; // For delayed hiding of controls
    let audioCtx; // Declared globally, initialized on user interaction
    let popSoundBuffer = null; // To store synthesized pop sound

    // Constants
    const BUBBLE_MIN_SIZE = 90; // Combined Min Width/Height
    const STICK_LAYOUT_RADIUS_FACTOR = 0.8; // How far out children are placed (factor of parent radius)
    const STICK_LAYOUT_START_ANGLE = -Math.PI / 2; // Start placing children at top (-90deg)

    // --- Theme Definitions ---
    const themes = [
        { name: 'Default Pastels', p1: '#a8e6cf', p2: '#dcedc1', p3: '#ffd3b6', p4: '#ffaaa5', p5: '#ff8b94' },
        { name: 'Cool Blues', p1: '#b3e0ff', p2: '#e0f7fa', p3: '#b2ebf2', p4: '#80deea', p5: '#4dd0e1' },
        { name: 'Warm Sunset', p1: '#ffccbc', p2: '#ffab91', p3: '#ff8a65', p4: '#ff7043', p5: '#ffca28' },
        { name: 'Muted Greens', p1: '#dcedc8', p2: '#c5e1a5', p3: '#aed581', p4: '#9ccc65', p5: '#8bc34a' },
        { name: 'Lavender Dream', p1: '#e1bee7', p2: '#ce93d8', p3: '#ba68c8', p4: '#ab47bc', p5: '#d1c4e9' },
    ];
    let currentThemeIndex = 0;

    // --- Audio Initialization & Pop Sound Synthesis ---
    function initAudioContext() {
        // Check if context exists or if the API is supported
        if (audioCtx || !(window.AudioContext || window.webkitAudioContext)) {
            if (!audioCtx && !(window.AudioContext || window.webkitAudioContext)) {
                 console.warn("Web Audio API not supported by this browser.");
            }
            return; // Exit if context exists or API not supported
        }

        // Attempt to create the AudioContext
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext initialized by user interaction.");
            createPopSound(); // Synthesize sound once context is ready
        } catch(e) {
            console.error("Web Audio API could not be initialized.", e);
            audioCtx = null; // Ensure audioCtx remains null if creation failed
        }
    }


    function createPopSound() {
        if (!audioCtx || popSoundBuffer) return; // Already created or no context

        // Simple synthesized pop sound
        const duration = 0.05; // Short duration
        const sampleRate = audioCtx.sampleRate;
        const frameCount = Math.floor(sampleRate * duration); // Ensure integer frame count
        popSoundBuffer = audioCtx.createBuffer(1, frameCount, sampleRate);
        const channelData = popSoundBuffer.getChannelData(0);

        for (let i = 0; i < frameCount; i++) {
            // Simple decaying noise burst
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i / frameCount), 2); // Exponential decay
        }
        console.log("Pop sound synthesized.");
    }

    function playPopSound() {
        if (!audioCtx || !popSoundBuffer) {
            initAudioContext(); // Attempt lazy initialization
            if (!audioCtx || !popSoundBuffer) {
                 console.warn("Cannot play pop sound: AudioContext or sound buffer not ready.");
                 return;
            }
        }

        try {
            const source = audioCtx.createBufferSource();
            source.buffer = popSoundBuffer;

            const gainNode = audioCtx.createGain();
            // Set volume - adjust 0.2 for louder/quieter pop
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            source.start();
        } catch (e) {
             console.error("Error playing pop sound:", e);
        }
    }

    // --- Core Bubble Functions ---

    function createBubbleElement(bubbleData) {
        const bubbleEl = document.createElement('div');
        bubbleEl.classList.add('bubble');
        bubbleEl.dataset.id = bubbleData.id;

        // Apply position, size, and color from data
        bubbleEl.style.left = `${bubbleData.x}%`;
        bubbleEl.style.top = `${bubbleData.y}%`;
        bubbleEl.style.width = `${bubbleData.width || 150}px`;
        bubbleEl.style.height = `${bubbleData.height || 150}px`; // Use height from data
        bubbleEl.style.backgroundColor = bubbleData.color || getRandomPastelColor(); // Use saved color or random

        // Use a consistent property or method for animation duration
        const floatDuration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bubble-float-duration')) || 15;
        bubbleEl.style.animationDelay = `${Math.random() * -1 * floatDuration}s`;

        // --- Title Element ---
        const titleEl = document.createElement('div');
        titleEl.classList.add('bubble-title');
        titleEl.textContent = bubbleData.title || ''; // Display title
        bubbleEl.appendChild(titleEl);

        // --- Content Element ---
        const contentEl = document.createElement('div');
        contentEl.classList.add('bubble-content');
        renderContent(contentEl, bubbleData); // Initial render
        bubbleEl.appendChild(contentEl);

        // --- Controls Element ---
        const controlsEl = document.createElement('div');
        controlsEl.classList.add('bubble-controls');

        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('bubble-delete-btn');
        deleteBtn.innerHTML = '&times;'; // Multiplication sign 'x'
        deleteBtn.title = 'Delete Bubble';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag
            deleteBubble(bubbleData.id); // Call delete function
        });

        const editBtn = document.createElement('button');
        editBtn.classList.add('bubble-edit-btn');
        editBtn.innerHTML = '&#9998;'; // Pencil symbol
        editBtn.title = 'Edit Content & Title';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag
            editBubbleContent(bubbleEl, bubbleData); // Call edit function
        });

        // Color Picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.classList.add('bubble-color-picker');
        // Ensure initial value matches the bubble's background, converting RGBA back to HEX
        colorPicker.value = rgbToHex(bubbleEl.style.backgroundColor) || '#FFFFFF'; // Default white
        colorPicker.title = 'Change Bubble Color';
        colorPicker.addEventListener('input', (e) => {
            e.stopPropagation();
            const newColor = e.target.value;
            // Update visually immediately with transparency
            bubbleEl.style.backgroundColor = hexToRgba(newColor, 0.7); // Use 0.7 alpha
        });
         colorPicker.addEventListener('change', (e) => { // Save on final color selection
            e.stopPropagation();
            const finalColorHex = e.target.value;
            const finalColorRgba = hexToRgba(finalColorHex, 0.7); // Store the RGBA version
            bubbleData.color = finalColorRgba; // Save RGBA color string to data
            saveState();
        });


        controlsEl.appendChild(colorPicker); // Add color picker first
        controlsEl.appendChild(editBtn);
        controlsEl.appendChild(deleteBtn);
        bubbleEl.appendChild(controlsEl);

        // --- Resize Handle ---
        const resizeHandle = document.createElement('div');
        resizeHandle.classList.add('resize-handle');
        resizeHandle.title = 'Resize Bubble (Keeps Shape)';
        resizeHandle.addEventListener('mousedown', startResize);
        bubbleEl.appendChild(resizeHandle);

        // --- Event Listeners (Hover, Drag) ---
        // Add listeners to bubble, controls, and handle for hover management
        bubbleEl.addEventListener('mouseenter', handleMouseEnter);
        bubbleEl.addEventListener('mouseleave', handleMouseLeave);
        controlsEl.addEventListener('mouseenter', handleMouseEnter);
        controlsEl.addEventListener('mouseleave', handleMouseLeave);
        resizeHandle.addEventListener('mouseenter', handleMouseEnter);
        resizeHandle.addEventListener('mouseleave', handleMouseLeave);

        // Main drag listener on the bubble element
        bubbleEl.addEventListener('mousedown', startDrag);

        // Apply 'stuck' class if loaded bubble is stuck
        if (bubbleData.stuckTo) {
            bubbleEl.classList.add('stuck');
        }

        return bubbleEl;
    }

    // Hover Handling Functions for Controls Visibility
    function handleMouseEnter(e) {
        const bubbleEl = e.currentTarget.closest('.bubble');
        if (!bubbleEl) return;
        if (hoverTimeout) clearTimeout(hoverTimeout); // Clear any pending hide timeout
        // Add the active class only if not currently dragging or resizing
        if (!bubbleEl.classList.contains('dragging') && !bubbleEl.classList.contains('resizing')) {
             bubbleEl.classList.add('controls-active');
        }
    }

    function handleMouseLeave(e) {
        const bubbleEl = e.currentTarget.closest('.bubble');
        if (!bubbleEl) return;
        // Set a timeout to remove the class, allowing time to move onto controls/handle
        hoverTimeout = setTimeout(() => {
              // Check if the mouse is truly outside the bubble AND its controls/handle
              if (!bubbleEl.matches(':hover') &&
                  !bubbleEl.querySelector('.bubble-controls:hover') &&
                  !bubbleEl.querySelector('.resize-handle:hover'))
              {
                   bubbleEl.classList.remove('controls-active');
              }
        }, 150); // 150ms delay - adjust if needed
    }

    // --- Content Rendering & Detection ---
    function detectContentType(text) {
        if (!text || text.trim() === '') return 'note'; // Default to note
        text = text.trim();
        // Image URL Check (ends with extensions or starts with data:image)
        if (/\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(text) || /^data:image\//i.test(text)) return 'image';
        // Link URL Check (starts with http/https)
        if (/^https?:\/\/\S+$/i.test(text)) return 'link';
        // To-Do List Check (Markdown style: * [ ] or - [x] or + [ ])
        if (/^(\*|-|\+)\s+\[[ x]\]\s+/im.test(text)) return 'todo';
        // Basic List Check (Markdown style: * or - or +) - check after others
        if (/^(\*|-|\+)\s+/im.test(text)) return 'list';
        // Default: Plain Note
        return 'note';
    }

    function renderContent(contentEl, bubbleData, isEditing = false) {
        contentEl.innerHTML = ''; // Clear previous content

        if (isEditing) {
            // --- SEAMLESS EDITING VIEW ---
            const textarea = document.createElement('textarea');
            textarea.value = bubbleData.content || '';
            textarea.placeholder = 'Type or paste content...';
            textarea.classList.add('seamless-editing');
            contentEl.appendChild(textarea);

            // Autosave when the textarea loses focus (blur event)
            textarea.addEventListener('blur', (e) => {
                // Pass the parent bubble element to the save function
                saveBubbleEdits(e.target.closest('.bubble'));
            });

            // Auto-focus the textarea with a small delay
            setTimeout(() => textarea.focus(), 0);

        } else {
            // --- DISPLAY VIEW ---
            const content = bubbleData.content || '';
            // Handle different content types based on bubbleData.contentType
            switch(bubbleData.contentType) {
                case 'image':
                    const img = document.createElement('img');
                    img.src = content;
                    img.alt = 'User Image';
                    // Basic error handling for broken image links
                    img.onerror = () => { contentEl.innerHTML = '<p style="color: red;">(Invalid Image URL)</p>'; };
                    contentEl.appendChild(img);
                    break;
                case 'link':
                    const link = document.createElement('a');
                    link.href = content;
                    link.textContent = content; // Display the URL itself
                    link.target = '_blank'; // Open in new tab
                    link.rel = 'noopener noreferrer'; // Security measure
                    contentEl.appendChild(link);
                    break;
                case 'todo': // Render ToDo list
                case 'list': // Render Basic list (uses same UL structure)
                    const list = document.createElement('ul');
                    const lines = content.split('\n');
                    let hasContentAbove = false; // Flag to track if non-list text precedes the list

                    lines.forEach((line, index) => {
                        const trimmedLine = line.trim();
                        const todoMatch = line.match(/^(\*|-|\+)\s+\[([ x]\])\s+(.*)/i); // Match checkbox list item
                        const listMatch = !todoMatch && line.match(/^(\*|-|\+)\s+(.*)/); // Match basic list item only if not todo

                        if (todoMatch || listMatch) {
                            // If there was text before this list item, render the list
                            if (!list.parentNode && hasContentAbove) {
                                contentEl.appendChild(list);
                            } else if (!list.parentNode) {
                                contentEl.appendChild(list); // Append list if it's the first element
                            }

                            const li = document.createElement('li');
                            if (todoMatch) {
                                const checkbox = document.createElement('input');
                                checkbox.type = 'checkbox';
                                checkbox.checked = todoMatch[2].toLowerCase() === 'x';
                                checkbox.dataset.lineIndex = index; // Store original line index
                                // Add event listener to toggle state and save
                                checkbox.addEventListener('change', (e) => {
                                    const bubbleEl = e.target.closest('.bubble');
                                    const currentBubbleData = bubbleEl ? findBubbleData(bubbleEl.dataset.id) : null;
                                    if(currentBubbleData) {
                                        toggleTodoItem(currentBubbleData, e.target.dataset.lineIndex, e.target.checked);
                                        saveState(); // Save immediately on checkbox change
                                    }
                                });
                                const span = document.createElement('span');
                                span.textContent = todoMatch[3]; // The task text
                                li.appendChild(checkbox);
                                li.appendChild(span);
                            } else if (listMatch) {
                                li.textContent = listMatch[2]; // Basic list item text
                            }
                            list.appendChild(li);
                            hasContentAbove = true; // Mark that we've encountered list items or text

                        } else if (trimmedLine !== '') {
                            // Render non-list lines as paragraphs or headings
                            const el = document.createElement('p');
                            el.classList.add('content-paragraph');
                            let textContent = line; // Use original line to preserve indentation if needed later
                            if (trimmedLine.startsWith('#')) {
                                 el.classList.add('content-heading');
                                 textContent = trimmedLine.substring(1).trim(); // Remove # for heading
                            }
                            el.textContent = textContent;
                            contentEl.appendChild(el); // Append paragraph/heading directly
                            hasContentAbove = true; // Mark that we've encountered text
                        } else if (hasContentAbove && index < lines.length -1 ) {
                             // Render empty lines between content blocks if needed
                             // contentEl.appendChild(document.createElement('br'));
                        }
                    });
                    break;

                case 'note':
                default: // Default to rendering as plain text note
                    const noteP = document.createElement('p');
                    noteP.style.whiteSpace = 'pre-wrap'; // Respect newlines in notes
                    noteP.textContent = content || '(Empty Bubble)'; // Display content or placeholder
                    contentEl.appendChild(noteP);
                    break;
            }
        }
    }

    // Helper to toggle the check state in the raw content string
    function toggleTodoItem(bubbleData, lineIndexStr, isChecked) {
        let lines = bubbleData.content.split('\n');
        const index = parseInt(lineIndexStr, 10);
        // Ensure the line index is valid
        if (!isNaN(index) && lines[index] !== undefined) {
            // Replace [ ] with [x] or [x] with [ ]
            lines[index] = lines[index].replace(/\[[ x]\]/i, isChecked ? '[x]' : '[ ]');
            bubbleData.content = lines.join('\n');
            // No need to change contentType, it remains 'todo'
        }
    }

    // Function to initiate editing mode for a bubble
    function editBubbleContent(bubbleEl, bubbleData) {
        // Prevent starting edit if already in edit mode
        if (bubbleEl.querySelector('.bubble-content textarea.seamless-editing')) {
            console.log("Already editing bubble:", bubbleData.id);
            return;
        }
        console.log("Editing bubble:", bubbleData.id);

        // --- TITLE EDIT ---
        const titleEl = bubbleEl.querySelector('.bubble-title');
        if(titleEl) {
             const titleInput = document.createElement('input');
             titleInput.type = 'text';
             titleInput.value = bubbleData.title || ''; // Pre-fill with current title
             titleInput.placeholder = 'Bubble Title...';
             // Blur on title input doesn't save; save happens on content blur
             titleInput.addEventListener('keydown', (e) => {
                 // Move focus to content area on Enter key
                 if (e.key === 'Enter') {
                      e.preventDefault(); // Prevent potential form submission/newline
                      bubbleEl.querySelector('.bubble-content textarea.seamless-editing')?.focus();
                 }
             });
             titleEl.innerHTML = ''; // Clear the displayed title text
             titleEl.appendChild(titleInput); // Add the input field
              // Focus the title input first, with a slight delay
             setTimeout(() => titleInput.focus(), 0);
        }

        // --- CONTENT EDIT ---
        const contentEl = bubbleEl.querySelector('.bubble-content');
        renderContent(contentEl, bubbleData, true); // Render the seamless textarea

        // Update bubble state for editing
        bubbleEl.style.cursor = 'text'; // Set cursor to text input style
        // Remove drag listener to prevent dragging while editing
        bubbleEl.removeEventListener('mousedown', startDrag);
        // Add a listener to stop propagation for input clicks, preventing underlying actions
        bubbleEl.addEventListener('mousedown', stopPropagationWhileEditing);
        // Hide controls immediately when editing starts
        bubbleEl.classList.remove('controls-active');
        if (hoverTimeout) clearTimeout(hoverTimeout); // Clear any pending hide
    }

    // Saves both title and content when the main content textarea blurs
    function saveBubbleEdits(bubbleEl) {
         if (!bubbleEl) return; // Exit if bubble element doesn't exist
         const bubbleData = findBubbleData(bubbleEl.dataset.id);
         if (!bubbleData) return; // Exit if data for this bubble doesn't exist

         console.log('Autosaving edits for', bubbleData.id);

         // --- Save Title ---
         const titleInput = bubbleEl.querySelector('.bubble-title input');
         const titleEl = bubbleEl.querySelector('.bubble-title');
         if (titleInput && titleEl) { // Check if title input exists
             bubbleData.title = titleInput.value.trim(); // Update data
             titleEl.innerHTML = ''; // Remove input field
             titleEl.textContent = bubbleData.title; // Display the saved title text
         }

         // --- Save Content ---
         const textarea = bubbleEl.querySelector('.bubble-content textarea.seamless-editing');
         const contentEl = bubbleEl.querySelector('.bubble-content');
         if (textarea && contentEl) { // Check if textarea exists
             const newContent = textarea.value;
             const detectedType = detectContentType(newContent); // Detect type from new content

             bubbleData.content = newContent; // Update data
             bubbleData.contentType = detectedType; // Update content type

             // Re-render the content area in display mode
             renderContent(contentEl, bubbleData, false);
         }

         // --- Restore Bubble Interaction State ---
         bubbleEl.style.cursor = 'grab'; // Restore grab cursor
         // Remove the temporary mousedown listener used during editing
         bubbleEl.removeEventListener('mousedown', stopPropagationWhileEditing);
         // Re-attach the main drag listener
         bubbleEl.addEventListener('mousedown', startDrag);

         // Save the entire application state
         saveState();
    }


    // Prevents drag/other actions when clicking inside editable fields
    function stopPropagationWhileEditing(e) {
        const targetTag = e.target.tagName.toUpperCase();
        // Allow interaction ONLY within TITLE INPUT or CONTENT TEXTAREA
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
             e.stopPropagation(); // Stop the click from reaching the bubble's drag handler
        }
         // Clicking elsewhere within the bubble during edit mode will do nothing (won't start drag)
    }

    // --- Add/Delete/RenderAll ---
    function addBubble() {
        const defaultSize = 150; // Initial size for new bubbles
        // Create the data object for the new bubble
        const bubbleData = {
            id: `bubble-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID
            x: Math.random() * 70 + 5, // Random initial position (percentage)
            y: Math.random() * 60 + 5,
            width: defaultSize, // Initial width (pixels)
            height: defaultSize, // Initial height (pixels)
            color: getRandomPastelColor(), // Random initial color (RGBA string)
            title: '', // Start with an empty title
            content: '', // Start with empty content
            contentType: 'note', // Default content type
            stuckTo: null, // Not stuck initially
        };
        bubbles.push(bubbleData); // Add data to the main array
        const bubbleEl = createBubbleElement(bubbleData); // Create the DOM element
        bubbleContainer.appendChild(bubbleEl); // Add element to the page
        saveState(); // Save the updated state
    }

    function deleteBubble(id) {
        const bubbleEl = bubbleContainer.querySelector(`.bubble[data-id="${id}"]`);
        const bubbleDataIdx = bubbles.findIndex(b => b.id === id);

        // Exit if the bubble element or data doesn't exist
        if (!bubbleEl || bubbleDataIdx === -1) return;

        const deletedBubbleData = bubbles[bubbleDataIdx];
        const parentId = deletedBubbleData.stuckTo; // Get the ID of the parent, if any

        // Find direct children of the bubble being deleted
        const children = bubbles.filter(b => b.stuckTo === id);

        // Re-parent or detach children
        children.forEach(childData => {
            childData.stuckTo = parentId; // Connect child to the deleted bubble's parent (grandparent)
            const childEl = bubbleContainer.querySelector(`.bubble[data-id="${childData.id}"]`);
            if (childEl) {
                if (parentId) {
                    // If there's a new parent (grandparent), reposition relative to it
                    // Note: The actual repositioning happens in the updateChildLayout call below
                } else {
                    // If no new parent (deleted bubble was top-level), detach the child
                    childEl.classList.remove('stuck');
                    childEl.style.animationPlayState = 'running'; // Resume floating animation
                }
            }
        });

        // Remove the bubble from the data array *after* handling children
        bubbles.splice(bubbleDataIdx, 1);

        // Play sound and start pop animation
        playPopSound();
        bubbleEl.classList.add('popping');

        // Remove the DOM element after the pop animation completes
        const animationDuration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pop-animation-duration') || '0.3') * 1000;
        setTimeout(() => {
            bubbleEl.remove();
             // After removing the element, update the layout of the *original parent's* remaining children
             if(parentId) {
                  updateChildLayout(parentId);
             }
        }, animationDuration);

        // Save the state after modifying the data array
        saveState();
    }

    function renderAllBubbles() {
        bubbleContainer.innerHTML = ''; // Clear existing bubble elements
        const parentChildMap = new Map(); // To track parent-child relationships for layout

        // First pass: Create and append all bubble elements
        bubbles.forEach(bubbleData => {
            const bubbleEl = createBubbleElement(bubbleData);
            bubbleContainer.appendChild(bubbleEl);
            // If this bubble is stuck, record its parent-child relationship
            if (bubbleData.stuckTo) {
                 if (!parentChildMap.has(bubbleData.stuckTo)) {
                     parentChildMap.set(bubbleData.stuckTo, []); // Initialize array if parent not seen yet
                 }
                 parentChildMap.get(bubbleData.stuckTo).push(bubbleData.id); // Add child ID to parent's list
            }
        });

         // Second pass: Position all stuck bubbles based on the final counts
         parentChildMap.forEach((childrenIds, parentId) => {
             updateChildLayout(parentId, childrenIds); // Update layout for each parent
         });
    }

    // --- Dragging Logic ---
     function startDrag(e) {
         // Determine if the click target is interactive content
         const targetTag = e.target.tagName.toUpperCase();
         const isInteractive = ['TEXTAREA', 'BUTTON', 'INPUT', 'A'].includes(targetTag) ||
                               e.target.closest('.bubble-controls') || // Clicked within controls area
                               e.target.closest('.resize-handle');    // Clicked on resize handle

         if (isInteractive) return; // Do not start drag on interactive elements

        // Ensure we get the bubble div itself as the drag target
        draggedBubble = e.currentTarget.closest('.bubble');

        // Exit if bubble not found, is resizing, or is currently being edited
        if (!draggedBubble ||
             draggedBubble.classList.contains('resizing') ||
             draggedBubble.querySelector('.seamless-editing'))
        {
            return;
        }

        // Prepare for drag
        draggedBubble.classList.remove('controls-active'); // Hide controls
        if (hoverTimeout) clearTimeout(hoverTimeout); // Clear pending hide

        draggedBubble.classList.add('dragging'); // Add dragging class
        draggedBubble.style.animationPlayState = 'paused'; // Pause float animation
        const rect = draggedBubble.getBoundingClientRect(); // Get bubble position/size
        // Calculate mouse offset relative to bubble's top-left corner
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // Add listeners to track mouse movement and release
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', endDrag);
     }

     function drag(e) {
        if (!draggedBubble) return; // Exit if no bubble is being dragged
        e.preventDefault(); // Prevent default browser drag behavior (e.g., text selection)

        const containerRect = bubbleContainer.getBoundingClientRect(); // Get container dimensions
        // Calculate new raw pixel position based on mouse movement and offset
        let newX = e.clientX - offsetX - containerRect.left;
        let newY = e.clientY - offsetY - containerRect.top;
        // Get current bubble dimensions for boundary checks
        const bubbleWidth = draggedBubble.offsetWidth;
        const bubbleHeight = draggedBubble.offsetHeight;
        // Clamp position within container boundaries
        newX = Math.max(0, Math.min(newX, containerRect.width - bubbleWidth));
        newY = Math.max(0, Math.min(newY, containerRect.height - bubbleHeight));
        // Convert clamped pixel position to percentage for style update
        const newXPercent = (newX / containerRect.width) * 100;
        const newYPercent = (newY / containerRect.height) * 100;

        // Update the bubble's style immediately
        draggedBubble.style.left = `${newXPercent}%`;
        draggedBubble.style.top = `${newYPercent}%`;

        // --- Drag Chain: Update positions of all descendants ---
        updateDescendantPositions(draggedBubble.dataset.id);

        // --- Unsticking Check ---
        const draggedId = draggedBubble.dataset.id;
        const draggedBubbleData = findBubbleData(draggedId);
        if (!draggedBubbleData) return; // Should not happen if drag started correctly

        if (draggedBubbleData.stuckTo) { // Check if the dragged bubble is currently stuck
            const parentBubbleEl = bubbleContainer.querySelector(`.bubble[data-id="${draggedBubbleData.stuckTo}"]`);
            if (parentBubbleEl) { // Check if parent element exists
                // Calculate distance between centers to determine if unsticking should occur
                const draggedRect = draggedBubble.getBoundingClientRect();
                const draggedCenterX = draggedRect.left + draggedRect.width / 2;
                const draggedCenterY = draggedRect.top + draggedRect.height / 2;
                const parentRect = parentBubbleEl.getBoundingClientRect();
                const parentCenterX = parentRect.left + parentRect.width / 2;
                const parentCenterY = parentRect.top + parentRect.height / 2;
                const distSq = (draggedCenterX - parentCenterX)**2 + (draggedCenterY - parentCenterY)**2;

                // Define unstick threshold based on combined radii plus a buffer (squared for efficiency)
                const unstickThresholdSq = (parentRect.width/2 + draggedRect.width/2 + 30)**2; // 30px buffer

                if (distSq > unstickThresholdSq) { // If dragged far enough
                    console.log(`Unsticking ${draggedId} from ${draggedBubbleData.stuckTo}`);
                    const oldParentId = draggedBubbleData.stuckTo; // Remember parent for layout update
                    draggedBubbleData.stuckTo = null; // Update data: no longer stuck
                    draggedBubble.classList.remove('stuck'); // Remove visual class
                    draggedBubble.style.animationPlayState = 'running'; // Resume floating
                    updateChildLayout(oldParentId); // Update layout of old parent's remaining children
                }
            } else { // Parent element doesn't exist (e.g., deleted during drag)
                draggedBubbleData.stuckTo = null; // Unstick data
                draggedBubble.classList.remove('stuck');
                draggedBubble.style.animationPlayState = 'running';
            }
        }
     }

     function endDrag(e) {
        if (!draggedBubble) return; // Exit if no bubble was being dragged

        const draggedId = draggedBubble.dataset.id;
        const draggedBubbleData = findBubbleData(draggedId);
        if (!draggedBubbleData) { // Data inconsistency check
            console.error("endDrag: Could not find data for dragged bubble ID:", draggedId);
            cleanupDrag(); // Cleanup listeners even if data is missing
            return;
        }

        const containerRect = bubbleContainer.getBoundingClientRect();
        // --- Final Position Update in Data ---
        // Read final position from the style (already in percentage)
        draggedBubbleData.x = parseFloat(draggedBubble.style.left);
        draggedBubbleData.y = parseFloat(draggedBubble.style.top);

        // --- Sticking Check ---
        let closestBubbleData = null;
        let minDistSq = Infinity; // Initialize with a large value
        const draggedRect = draggedBubble.getBoundingClientRect();
        const draggedCenterX = draggedRect.left + draggedRect.width / 2;
        const draggedCenterY = draggedRect.top + draggedRect.height / 2;

        // Iterate through all other bubbles to find potential sticking targets
        bubbles.forEach(b => {
            // Cannot stick to self, its own children, or its current parent
            if (b.id === draggedId || b.stuckTo === draggedId || draggedBubbleData.stuckTo === b.id) return;

            const targetEl = bubbleContainer.querySelector(`.bubble[data-id="${b.id}"]`);
            // Skip if target element doesn't exist or is being deleted
            if (!targetEl || targetEl.classList.contains('popping')) return;

            // Calculate distance between centers (squared)
            const targetRect = targetEl.getBoundingClientRect();
            const targetCenterX = targetRect.left + targetRect.width / 2;
            const targetCenterY = targetRect.top + targetRect.height / 2;
            const dx = draggedCenterX - targetCenterX;
            const dy = draggedCenterY - targetCenterY;
            const distSq = dx*dx + dy*dy;

            // Define the sticking threshold based on combined radii plus a buffer (squared)
            const stickThresholdSq = (draggedRect.width / 2 + targetRect.width / 2 + stickDistance / 2)**2;

            // If closer than threshold AND closer than the current minimum, update closest target
            if (distSq < stickThresholdSq && distSq < minDistSq) {
                minDistSq = distSq;
                closestBubbleData = b;
            }
        });

        // --- Perform Sticking ---
        let stuckOccurred = false;
        // Only stick if a close enough target was found AND the bubble isn't already stuck
        if (closestBubbleData && !draggedBubbleData.stuckTo) {
            console.log(`Sticking ${draggedId} to ${closestBubbleData.id}`);
            draggedBubbleData.stuckTo = closestBubbleData.id; // Update data: set parent ID
            draggedBubble.classList.add('stuck'); // Add visual class
            draggedBubble.style.animationPlayState = 'paused'; // Stop floating animation
            // Update the layout for the new parent and its children (including the newly stuck one)
            updateChildLayout(closestBubbleData.id);
            stuckOccurred = true;

            // --- Update Data Position After Snap ---
            // The layout function moved the element; read its final snapped position
            const snappedRect = draggedBubble.getBoundingClientRect();
            draggedBubbleData.x = ((snappedRect.left - containerRect.left) / containerRect.width) * 100;
            draggedBubbleData.y = ((snappedRect.top - containerRect.top) / containerRect.height) * 100;
        }

        // --- Final Position Update for Descendants ---
        // Ensure all children (and their children, etc.) are correctly positioned relative to the dragged bubble
        updateDescendantPositions(draggedId);

        // --- Resume Floating ---
        // Resume animation only if the bubble did NOT end up stuck AND is not currently popping
        if (!draggedBubbleData.stuckTo && !draggedBubble.classList.contains('popping')) {
             draggedBubble.style.animationPlayState = 'running';
        }

        // --- Cleanup ---
        cleanupDrag(); // Remove dragging class and listeners
        saveState(); // Save the final state
    }

    // Helper function to remove drag listeners and reset state
    function cleanupDrag() {
         if(draggedBubble) {
             draggedBubble.classList.remove('dragging'); // Remove visual indicator
             draggedBubble = null; // Clear the reference
         }
         // Remove global listeners attached during drag
         document.removeEventListener('mousemove', drag);
         document.removeEventListener('mouseup', endDrag);
    }

    // Recursive function to update positions of all stuck descendants relative to their parents
    function updateDescendantPositions(parentId) {
         // Find direct children of the given parent ID
         const children = bubbles.filter(b => b.stuckTo === parentId);
         const parentEl = bubbleContainer.querySelector(`.bubble[data-id="${parentId}"]`);
         if (!parentEl || children.length === 0) return; // Exit if parent element not found or no children

         const containerRect = bubbleContainer.getBoundingClientRect(); // Get container bounds

         // Iterate through each direct child
         children.forEach((childData, index) => {
             const childEl = bubbleContainer.querySelector(`.bubble[data-id="${childData.id}"]`);
             if (childEl) { // Check if child element exists in the DOM
                  // Calculate the target position using the layout function
                  const { leftPercent, topPercent } = getArrangedChildPosition(parentEl, childEl, index, children.length);

                  // --- Update Style ---
                  childEl.style.left = `${leftPercent}%`;
                  childEl.style.top = `${topPercent}%`;

                  // --- Update Data ---
                  // Store the calculated percentage position in the child's data object
                  childData.x = leftPercent;
                  childData.y = topPercent;

                  // --- Recurse ---
                  // Call this function again for the current child to update its descendants
                  updateDescendantPositions(childData.id);
             }
         });
    }


    // --- Sticking Layout ---
    // Updates the layout of all direct children of a given parent
    function updateChildLayout(parentId, childrenIds = null) {
        const parentEl = bubbleContainer.querySelector(`.bubble[data-id="${parentId}"]`);
        if (!parentEl) return; // Exit if parent element doesn't exist

        // Determine the list of children to position: use provided IDs or find them in the data
        const childrenToPosition = childrenIds ?
             childrenIds
                .map(id => ({ id, el: bubbleContainer.querySelector(`.bubble[data-id="${id}"]`) })) // Map IDs to data+element objects
                .filter(c => c.el && !c.el.classList.contains('popping')) // Filter out those whose element doesn't exist or is popping
             : bubbles
                .filter(b => b.stuckTo === parentId) // Find all bubbles stuck to this parent
                .map(b => ({ id: b.id, el: bubbleContainer.querySelector(`.bubble[data-id="${b.id}"]`) })) // Map data to data+element objects
                .filter(c => c.el && !c.el.classList.contains('popping')); // Filter out non-existent/popping elements

        const numChildren = childrenToPosition.length; // Number of valid children to arrange

        // Iterate through each child and calculate its position
        childrenToPosition.forEach((child, index) => {
            // Calculate and apply the position using the helper function
            positionStuckBubble(child.el, parentId, index, numChildren);

            // Ensure the child has the 'stuck' class and paused animation
            child.el.classList.add('stuck');
            child.el.style.animationPlayState = 'paused';

            // --- Update Child Data Position ---
            // Read the final calculated position from the style and update the child's data object
            const childData = findBubbleData(child.id);
            if (childData) {
                 // Update data immediately after positioning
                 childData.x = parseFloat(child.el.style.left);
                 childData.y = parseFloat(child.el.style.top);
            }
        });
    }


    // Positions a single stuck bubble relative to its parent using the arrangement logic
    function positionStuckBubble(stuckEl, parentId, childIndex, totalChildren) {
        const parentEl = bubbleContainer.querySelector(`.bubble[data-id="${parentId}"]`);
        // Exit if either element is missing
        if (!parentEl || !stuckEl) return;

        // Get the calculated percentage position from the arrangement function
        const { leftPercent, topPercent } = getArrangedChildPosition(parentEl, stuckEl, childIndex, totalChildren);

        // Apply the calculated position to the stuck element's style
        stuckEl.style.left = `${leftPercent}%`;
        stuckEl.style.top = `${topPercent}%`;
    }

    // Calculates the target percentage position for a child arranged circularly around a parent
    function getArrangedChildPosition(parentEl, childEl, childIndex, totalChildren) {
         const parentRect = parentEl.getBoundingClientRect();
         const childRect = childEl.getBoundingClientRect(); // Use child's current size for calculation
         const containerRect = bubbleContainer.getBoundingClientRect();

         // Radii of parent and child
         const parentRadius = parentRect.width / 2;
         const childRadius = childRect.width / 2;

         // Calculate the angle for this child's position
         // Spread children over approximately 320 degrees to leave a gap
         const angleIncrement = totalChildren > 0 ? (Math.PI * 1.8) / totalChildren : 0;
         const angle = STICK_LAYOUT_START_ANGLE + (childIndex * angleIncrement);

         // Calculate distance from parent center to child center
         // Based on combined radii, a scaling factor, and a small fixed gap
         const distance = (parentRadius + childRadius) * STICK_LAYOUT_RADIUS_FACTOR + 10; // 10px gap

         // Parent center coordinates in pixels relative to the container
         const parentCenterXpx = (parentRect.left - containerRect.left) + parentRadius;
         const parentCenterYpx = (parentRect.top - containerRect.top) + parentRadius;

         // Calculate child's target center coordinates
         const childCenterXpx = parentCenterXpx + distance * Math.cos(angle);
         const childCenterYpx = parentCenterYpx + distance * Math.sin(angle);

         // Convert child's target center coordinates to top-left coordinates
         let targetLeftPx = childCenterXpx - childRadius;
         let targetTopPx = childCenterYpx - childRadius;

         // --- Clamp Position within Container Bounds ---
         targetLeftPx = Math.max(0, Math.min(targetLeftPx, containerRect.width - childRect.width));
         targetTopPx = Math.max(0, Math.min(targetTopPx, containerRect.height - childRect.height));

         // Convert clamped pixel position back to percentage for CSS styling
         const leftPercent = (targetLeftPx / containerRect.width) * 100;
         const topPercent = (targetTopPx / containerRect.height) * 100;

         // Return the calculated percentage position
         return { leftPercent, topPercent };
    }


    // --- Resizing Logic (Circular) ---
    function startResize(e) {
        e.stopPropagation(); // Prevent drag start
        resizingBubble = e.target.closest('.bubble'); // Get the bubble being resized
        // Exit if bubble not found or is currently being edited
        if (!resizingBubble || resizingBubble.querySelector('.seamless-editing')) return;

        // Prepare for resize
        resizingBubble.classList.remove('controls-active'); // Hide controls
        if (hoverTimeout) clearTimeout(hoverTimeout); // Clear pending hide

        resizingBubble.classList.add('resizing'); // Add resizing class
        resizingBubble.style.animationPlayState = 'paused'; // Pause float animation
        const rect = resizingBubble.getBoundingClientRect(); // Get initial size/pos
        initialX = e.clientX; initialY = e.clientY; // Record initial mouse position
        initialWidth = rect.width; initialHeight = rect.height; // Record initial dimensions
        initialAspect = initialWidth / initialHeight; // Store initial aspect ratio (~1 for circle)

        // Add listeners for mouse movement and release
        document.addEventListener('mousemove', resizeBubble);
        document.addEventListener('mouseup', stopResize);
    }

    function resizeBubble(e) {
        if (!resizingBubble) return; // Exit if not resizing
        e.preventDefault(); // Prevent default drag behavior

        // Calculate mouse movement delta
        const dx = e.clientX - initialX;
        const dy = e.clientY - initialY;

        // Use the larger delta (max of horizontal/vertical change) to drive resize
        // This makes resizing feel more natural for a circle from a corner handle
        const delta = Math.max(dx, dy);

        // Calculate new width based on the delta
        let newWidth = initialWidth + delta;
        // Calculate new height based on new width and initial aspect ratio to maintain shape
        let newHeight = newWidth / initialAspect;

        // --- Apply Minimum Size Constraints ---
        newWidth = Math.max(BUBBLE_MIN_SIZE, newWidth);
        newHeight = Math.max(BUBBLE_MIN_SIZE, newHeight); // Use the same min size

        // --- Boundary Check ---
        const containerRect = bubbleContainer.getBoundingClientRect();
        const bubbleRect = resizingBubble.getBoundingClientRect(); // Get current position (top-left)
        const currentLeftPx = bubbleRect.left - containerRect.left;
        const currentTopPx = bubbleRect.top - containerRect.top;

        // Check if resizing exceeds right boundary
        if (currentLeftPx + newWidth > containerRect.width) {
             newWidth = containerRect.width - currentLeftPx; // Clamp width
             newHeight = newWidth / initialAspect; // Adjust height to maintain aspect ratio
        }
        // Check if resizing exceeds bottom boundary
         if (currentTopPx + newHeight > containerRect.height) {
             newHeight = containerRect.height - currentTopPx; // Clamp height
              newWidth = newHeight * initialAspect; // Adjust width to maintain aspect ratio
        }
        // Re-check minimums after boundary clamping
        newWidth = Math.max(BUBBLE_MIN_SIZE, newWidth);
        newHeight = Math.max(BUBBLE_MIN_SIZE, newHeight);

        // --- Apply New Size ---
        resizingBubble.style.width = `${newWidth}px`;
        resizingBubble.style.height = `${newHeight}px`; // Set height to maintain circle

        // --- Update Children Layout ---
        // Reposition any stuck children relative to the resizing parent immediately
        updateDescendantPositions(resizingBubble.dataset.id);
    }

    function stopResize(e) {
        if (!resizingBubble) return; // Exit if not resizing

        resizingBubble.classList.remove('resizing'); // Remove resizing class
        const bubbleData = findBubbleData(resizingBubble.dataset.id); // Get corresponding data

        // Remove mouse listeners
        document.removeEventListener('mousemove', resizeBubble);
        document.removeEventListener('mouseup', stopResize);

        if (bubbleData) { // Check if data exists
            // --- Save Final Size to Data ---
            bubbleData.width = parseFloat(resizingBubble.style.width);
            bubbleData.height = parseFloat(resizingBubble.style.height); // Save height as well

            // --- Final Update for Descendants ---
            // Ensure all descendants are correctly positioned based on the final size
            updateDescendantPositions(bubbleData.id);

            // --- Resume Floating (if applicable) ---
            // Resume animation only if the bubble is not stuck to a parent
             if (!bubbleData.stuckTo) {
                 resizingBubble.style.animationPlayState = 'running';
             }
             saveState(); // Save the updated state including the new size
        } else {
             console.error("stopResize: Could not find data for bubble ID:", resizingBubble.dataset.id);
        }

        resizingBubble = null; // Clear the resizing state variable
    }

    // --- Persistence (Save/Load/Export/Import) ---
    function saveState() {
        // Map bubble data to a serializable format
        const stateToSave = bubbles.map(b => ({
            id: b.id,
            x: b.x, y: b.y, // Position (percentage)
            width: b.width, height: b.height, // Size (pixels)
            color: b.color, // Color (RGBA string)
            title: b.title, // Title string
            content: b.content, // Content string
            contentType: b.contentType, // Detected content type
            stuckTo: b.stuckTo // ID of parent bubble or null
        }));
        // Store the JSON string in localStorage
        try {
            localStorage.setItem('calmBubblesState', JSON.stringify(stateToSave));
        } catch (e) {
             console.error("Error saving state to localStorage:", e);
             alert("Could not save state. LocalStorage might be full or disabled.");
        }
        // console.log("State saved."); // Optional: logging for debugging
    }

    function loadState() {
        const savedState = localStorage.getItem('calmBubblesState'); // Retrieve saved state string
        if (savedState) {
            try {
                const loadedBubbles = JSON.parse(savedState); // Parse the JSON string
                // Map loaded data to the internal bubbles array, providing defaults for missing fields
                bubbles = loadedBubbles.map(b => ({
                    ...b, // Spread existing properties from loaded data
                    width: b.width || 150, // Default width if missing
                    height: b.height || 150, // Default height if missing
                    contentType: b.contentType || detectContentType(b.content || ''), // Detect type if missing
                    color: b.color || getRandomPastelColor(), // Default color if missing
                    title: b.title || '', // Default empty title if missing
                }));
                console.log("State loaded:", bubbles.length, "bubbles");

            } catch (e) { // Handle potential JSON parsing errors
                console.error("Error loading state from localStorage:", e);
                localStorage.removeItem('calmBubblesState'); // Clear corrupted state
                bubbles = []; // Start with an empty array
            }
        } else { // No saved state found
             console.log("No saved state found.");
             bubbles = []; // Ensure bubbles array is empty
        }

        // Apply the initial or saved theme before rendering
        // Optional: Load saved theme index here if implemented
        applyTheme(themes[currentThemeIndex]);
        // Render all bubbles based on the loaded or empty state
        renderAllBubbles();
    }

    function exportToMarkdown() {
        // Prepare data for export, ensuring dimensions are numbers
        const stateToExport = bubbles.map(b => ({
             id: b.id, x: b.x, y: b.y,
             width: parseFloat(b.width || 150), // Ensure width is number
             height: parseFloat(b.height || 150), // Ensure height is number
             color: b.color, title: b.title, // Include title
             content: b.content, contentType: b.contentType, stuckTo: b.stuckTo
         }));
         // Convert data to pretty-printed JSON string
         const stateString = JSON.stringify(stateToExport, null, 2);
         // Create Markdown content with the JSON block
         const markdownContent = `# Calm Bubbles State\n\nThis file contains the state of your bubbles application. You can manually edit the JSON data below, but be careful.\n\n\`\`\`json\n${stateString}\n\`\`\`\n`;
         // Create a Blob and download link
         const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `calm-bubbles-state-${new Date().toISOString().slice(0,10)}.md`; // Filename with date
         document.body.appendChild(a); // Add link to DOM
         a.click(); // Programmatically click the link to trigger download
         document.body.removeChild(a); // Remove link from DOM
         URL.revokeObjectURL(url); // Release the object URL
         console.log("Exported state to Markdown.");
    }

    function importFromMarkdown(file) {
         if (!file) return; // Exit if no file selected
         const reader = new FileReader(); // Create file reader

         reader.onload = (e) => { // Define action when file is loaded
             const content = e.target.result; // Get file content
             // Use regex to find the JSON code block
             const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
             const match = content.match(jsonRegex);

             if (match && match[1]) { // If JSON block found
                 try {
                     let loadedData = JSON.parse(match[1]); // Parse the JSON string
                     if (Array.isArray(loadedData)) { // Basic validation: check if it's an array
                         // Process loaded data, adding defaults for potentially missing fields
                         loadedData = loadedData.map(b => ({
                             ...b,
                             width: b.width || 150,
                             height: b.height || 150,
                             contentType: b.contentType || detectContentType(b.content || ''),
                             color: b.color || getRandomPastelColor(),
                             title: b.title || ''
                         }));
                         bubbles = loadedData; // Replace current data with loaded data
                         renderAllBubbles(); // Re-render the UI
                         saveState(); // Save the newly imported state to localStorage
                         console.log("Imported state from Markdown.");
                         alert(`Successfully imported ${bubbles.length} bubbles!`);
                     } else {
                         throw new Error("Parsed JSON data is not an array."); // Throw error if not array
                     }
                 } catch (error) { // Handle JSON parsing errors
                     console.error("Error parsing JSON from Markdown:", error);
                     alert("Import failed: Could not parse valid JSON data from the file. Check the file format.");
                 }
             } else { // No JSON block found in the file
                 alert("Import failed: Could not find a valid JSON code block (```json ... ```) in the file.");
             }
             importMdInput.value = ''; // Reset file input value
         };

         reader.onerror = () => { // Handle file reading errors
             console.error("Error reading file.");
             alert("Import failed: Could not read the selected file.");
             importMdInput.value = ''; // Reset file input value
         };

         reader.readAsText(file); // Read the file as text
    }


    // --- Utility Functions ---
    function getRandomPastelColor() {
         // Base RGB colors (brighter for better alpha blending)
         const baseColors = [
             '168, 230, 207', '220, 237, 193', '255, 211, 182',
             '255, 170, 165', '255, 139, 148', '199, 206, 234',
             '253, 221, 230', '188, 226, 237', '207, 207, 242', // Added Lavender Gray
             '242, 207, 220', // Added Soft Pink
             '207, 242, 227', // Added Minty Aqua
         ];
         const base = baseColors[Math.floor(Math.random() * baseColors.length)];
         // Return RGBA string with fixed alpha
         return `rgba(${base}, 0.7)`;
     }

    // Finds bubble data object by its ID
    function findBubbleData(id) {
        return bubbles.find(b => b.id === id);
    }

    // Color Conversion Helpers
    function rgbToHex(rgbString) {
        // Handles "rgba(r, g, b, a)" or "rgb(r, g, b)"
        if (!rgbString || !rgbString.toLowerCase().startsWith('rgb')) return null;
        // Extract numbers using regex
        const rgb = rgbString.match(/(\d+(\.\d+)?)/g); // Match numbers including decimals (for alpha)
        if (!rgb || rgb.length < 3) return null; // Need at least R, G, B

        // Convert R, G, B to integers and then to Hex
        const r = parseInt(rgb[0], 10);
        const g = parseInt(rgb[1], 10);
        const b = parseInt(rgb[2], 10);

        // Clamp values to 0-255
        const clamp = (val) => Math.max(0, Math.min(255, val));

        // Combine into hex string
        return "#" + ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1).toUpperCase();
    }

    function hexToRgba(hex, alpha = 1) {
        // Basic validation
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
             // Return a default transparent white if hex is invalid
             return `rgba(255, 255, 255, ${alpha})`;
        }

        let r = 0, g = 0, b = 0;
        // Handle shorthand hex (#RGB)
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        }
        // Handle full hex (#RRGGBB)
        else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        // Invalid hex length
        else {
             return `rgba(255, 255, 255, ${alpha})`; // Default on error
        }

        // Ensure alpha is within valid range 0-1
        const validAlpha = Math.max(0, Math.min(1, alpha));
        // Return the RGBA string
        return `rgba(${r}, ${g}, ${b}, ${validAlpha})`;
    }


    // --- Theme Changer ---
    // Applies the selected theme by updating CSS variables
    function applyTheme(theme) {
        if (!theme) return;
        console.log("Applying theme:", theme.name);
        rootStyle.setProperty('--pastel1', theme.p1);
        rootStyle.setProperty('--pastel2', theme.p2);
        rootStyle.setProperty('--pastel3', theme.p3);
        rootStyle.setProperty('--pastel4', theme.p4);
        rootStyle.setProperty('--pastel5', theme.p5);
        // Optional: Update specific button colors based on theme
        // e.g., changeThemeBtn.style.backgroundColor = theme.p3;
    }

    // Cycles to the next theme in the `themes` array
    function changeTheme() {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length; // Cycle index
        applyTheme(themes[currentThemeIndex]); // Apply the new theme
        // Optional: Save the current theme index to localStorage for persistence
        // localStorage.setItem('calmBubblesThemeIndex', currentThemeIndex);
    }

    // --- Global Event Listeners Setup ---
    addBubbleBtn.addEventListener('click', addBubble);
    changeThemeBtn.addEventListener('click', changeTheme);
    exportMdBtn.addEventListener('click', exportToMarkdown);
    // Listener for the hidden file input (triggered by label click)
    importMdInput.addEventListener('change', (e) => importFromMarkdown(e.target.files[0]));
    clearAllBtn.addEventListener('click', () => {
        // Confirmation dialog before clearing all bubbles
        if (confirm('Are you sure you want to delete ALL bubbles? This cannot be undone.')) {
            const allBubbleElements = bubbleContainer.querySelectorAll('.bubble');
            // If there are bubbles, play sound and animate removal
            if(allBubbleElements.length > 0) {
                 playPopSound(); // Play one sound for the batch deletion
                 // Add popping class to all bubbles simultaneously
                 allBubbleElements.forEach(el => el.classList.add('popping'));
                 // Get animation duration from CSS variable
                 const animationDuration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pop-animation-duration') || '0.3') * 1000;
                 // After animation, clear data, DOM, and save state
                 setTimeout(() => {
                     bubbles = []; // Clear data array
                     renderAllBubbles(); // Clear elements from container
                     saveState(); // Save the empty state
                 }, animationDuration);
            } else { // If already empty, just ensure data is clear and save
                 bubbles = [];
                 saveState();
            }
        }
     });

     // --- AudioContext Initialization Trigger ---
     // These listeners try to initialize the AudioContext on the first user interaction
     // Using { once: true } ensures they only fire once and then remove themselves
     document.addEventListener('click', initAudioContext, { once: true });
     document.addEventListener('keydown', initAudioContext, { once: true });


    // --- Initial Load ---
    // Optional: Load saved theme index from localStorage if implemented
    // const savedThemeIndex = localStorage.getItem('calmBubblesThemeIndex');
    // if (savedThemeIndex !== null) {
    //     currentThemeIndex = parseInt(savedThemeIndex, 10) % themes.length;
    // }
    loadState(); // Load bubble data and render the initial state

}); // End DOMContentLoaded