import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    collection,
    query,
    where,
    getDocs,
    Timestamp,
    writeBatch,
    serverTimestamp,
    setLogLevel
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- INICIO DEL SCRIPT DE LA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {

    // ==================================================================
    // PASO 1: PEGA TU CONFIGURACIÓN DE FIREBASE AQUÍ
    // Reemplaza este objeto con el que copiaste de tu consola de Firebase
    // ==================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyAZmYYrHy12JltEW-XKdBRT1HIxAGa5drc",
        authDomain: "gestion-de-proyectos-89b77.firebaseapp.com",
        projectId: "gestion-de-proyectos-89b77",
        storageBucket: "gestion-de-proyectos-89b77.appspot.com",
        messagingSenderId: "807084501465",
        appId: "1:807084501465:web:1168399489b74ceb0451c8"
    };
    // ==================================================================
    // ==================================================================

    // Usaremos el projectId como nuestro 'appId' para las rutas de Firestore
    const appId = firebaseConfig.projectId;

    // --- INICIALIZACIÓN DE FIREBASE ---
    let db, auth, storage, app;
    let currentUserId = null;
    let currentUserProfile = null;
    let appState = {
        teamMembers: [], // Perfiles de equipo
        projects: [],    // Proyectos
        currentProjectId: null,
        currentBudgetDetailProjectId: null,
        unsubscribeProjects: null,   // Listener para Proyectos
        unsubscribeTasks: null,      // Listener para Tareas
        unsubscribeExpenses: null,   // Listener para Gastos
        unsubscribeTeam: null,       // Listener para Equipo
        unsubscribeNotifications: null // Listener para Notificaciones
    };

    // Gráficos
    let ganttChartInstance = null;
    let categoryChartInstance = null;
    let progressChartInstance, statusChartInstance;

    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);
        setPersistence(auth, browserSessionPersistence);
        setLogLevel('Debug'); // Útil para depurar
        console.log("Firebase inicializado correctamente y persistencia configurada.");
    } catch (error) {
        console.error("Error inicializando Firebase:", error);
        alert("Error fatal: No se pudo conectar a la base de datos. Verifica tu 'firebaseConfig' en el archivo index.html.");
        return; // Detener la ejecución si Firebase no inicia
    }

    // --- DOM ELEMENTS ---
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // --- AUTHENTICATION LOGIC ---

    // Listener del estado de autenticación
    if (auth) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Usuario está logueado
                currentUserId = user.uid;

                // Ruta al perfil de usuario en la colección PÚBLICA de equipo
                const userProfileRef = doc(db, `artifacts/${appId}/public/data/team`, user.uid);
                const userProfileSnap = await getDoc(userProfileRef);

                if (userProfileSnap.exists()) {
                    // El usuario ya tiene un perfil, cargarlo
                    currentUserProfile = { id: user.uid, email: user.email, ...userProfileSnap.data() };
                } else {
                    // Primera vez que el usuario inicia sesión, crear perfil por defecto
                    console.log("Creando perfil por defecto para el nuevo usuario...");
                    let newProfile = {
                        name: user.email.split('@')[0],
                        role: "Visualizador", // Rol más bajo por seguridad
                        profile: "Visualizador",
                        avatar: `https://i.pravatar.cc/150?u=${user.uid}`
                    };

                    // Asignar rol de Admin si el email coincide
                    // (Asegúrate de haber creado este usuario en la consola de Firebase)
                    if (user.email === 'admin@corinfar.com') {
                        newProfile.name = "Admin Corinfar";
                        newProfile.role = "Administrador";
                        newProfile.profile = "Administrador";
                    }

                    await setDoc(userProfileRef, newProfile);
                    currentUserProfile = { id: user.uid, email: user.email, ...newProfile };
                }

                console.log("Perfil de usuario cargado:", currentUserProfile);

                // Iniciar la UI y cargar datos
                initializeAppUI();

                // Mostrar la app y ocultar el login
                loginOverlay.classList.add('opacity-0');
                setTimeout(() => {
                    loginOverlay.style.display = 'none';
                    appContainer.classList.remove('hidden');
                }, 500);

            } else {
                // Usuario no logueado
                console.log("Usuario deslogueado.");
                currentUserId = null;
                currentUserProfile = null;

                // Detener todos los listeners de datos
                detachAllListeners();

                // Mostrar el login y ocultar la app
                loginOverlay.style.display = 'flex';
                loginOverlay.classList.remove('opacity-0');
                appContainer.classList.add('hidden');

                // Limpiar los campos de texto del formulario de login
                const usernameInput = document.getElementById('username');
                const passwordInput = document.getElementById('password');
                if (usernameInput) usernameInput.value = '';
                if (passwordInput) passwordInput.value = '';
            }
        });
    }

    // Formulario de Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            loginError.textContent = '';

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // onAuthStateChanged se encargará del resto
                console.log("Inicio de sesión exitoso, esperando onAuthStateChanged...");
            } catch (error) {
                console.error("Error de inicio de sesión:", error.code);
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    loginError.textContent = 'Correo o contraseña incorrectos.';
                } else {
                    loginError.textContent = 'Error al iniciar sesión.';
                }
            }
        });
    }

    // Botón de Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
         try {
             await signOut(auth);
             console.log("Sesión cerrada.");
             // onAuthStateChanged se encargará de mostrar el login
         } catch (error) {
             console.error("Error al cerrar sesión:", error);
         }
    });

    // --- Helper para formatear moneda ---
    function formatCurrency(value) {
        if (typeof value !== 'number') {
            value = parseFloat(value) || 0;
        }
        return 'L' + value.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
    }

    // --- Función para crear notificaciones ---
    async function createNotification(message, icon = 'fa-info-circle', iconColor = 'text-slate-500') {
        if (!currentUserProfile) return;

        const actorName = currentUserProfile.name || 'Alguien';
        const fullMessage = `${actorName} ${message}`;
        const notificationRef = collection(db, `artifacts/${appId}/public/data/notifications`);

        try {
            await addDoc(notificationRef, {
                message: fullMessage,
                icon: icon,
                iconColor: iconColor,
                timestamp: serverTimestamp(),
                readBy: [currentUserId] // El creador ya la leyó
            });
        } catch (error) {
            console.error("Error creando notificación:", error);
        }
    }

    // --- DATA LISTENERS (FIREBASE) ---

    function detachAllListeners() {
        if (appState.unsubscribeProjects) appState.unsubscribeProjects();
        if (appState.unsubscribeTasks) appState.unsubscribeTasks();
        if (appState.unsubscribeExpenses) appState.unsubscribeExpenses();
        if (appState.unsubscribeTeam) appState.unsubscribeTeam();
        if (appState.unsubscribeNotifications) appState.unsubscribeNotifications();
        console.log("Todos los listeners de Firebase han sido detenidos.");
    }

    function attachDataListeners() {
        // Detener listeners antiguos por si acaso
        detachAllListeners();

        // 1. Listener para Perfiles de Equipo (Team)
        const teamRef = collection(db, `artifacts/${appId}/public/data/team`);
        appState.unsubscribeTeam = onSnapshot(teamRef, (snapshot) => {
            console.log("Datos de Equipo actualizados.");
            appState.teamMembers = [];
            snapshot.forEach(doc => {
                appState.teamMembers.push({ id: doc.id, ...doc.data() });
            });
            // Re-renderizar UI que dependa del equipo
            renderCollaboratorsTable();
        }, (error) => console.error("Error en listener de Equipo:", error));

        // 2. Listener para Proyectos
        const projectsRef = collection(db, `artifacts/${appId}/public/data/projects`);
        appState.unsubscribeProjects = onSnapshot(projectsRef, (snapshot) => {
            console.log("Datos de Proyectos actualizados.");
            appState.projects = [];
            snapshot.forEach(doc => {
                appState.projects.push({ id: doc.id, ...doc.data() });
            });

            // Re-renderizar UI que dependa de proyectos
            renderProjects();
            renderRecentProjects();
            updateDashboardStats();
            renderBudgetsTable();
        }, (error) => console.error("Error en listener de Proyectos:", error));

        // 3. Listener para Notificaciones (últimas 20)
        const notifRef = query(collection(db, `artifacts/${appId}/public/data/notifications`)); // TODO: Añadir orderBy y limit
        appState.unsubscribeNotifications = onSnapshot(notifRef, (snapshot) => {
            console.log("Notificaciones actualizadas.");
            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            // Ordenar por timestamp (más nuevo primero)
            notifications.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            renderNotifications(notifications);
        }, (error) => console.error("Error en listener de Notificaciones:", error));

        // Los listeners de Tareas y Gastos se activan al entrar a un proyecto
    }

    // --- Lógica de Foto de Perfil ---
    const changePhotoBtn = document.getElementById('change-photo-btn');
    const photoUploadInput = document.getElementById('photo-upload-input');
    const settingsUserAvatar = document.getElementById('settings-user-avatar');
    let selectedAvatarFile = null;

    if (changePhotoBtn && photoUploadInput) {
        changePhotoBtn.addEventListener('click', () => {
            photoUploadInput.click();
        });
    }

    if (photoUploadInput) {
        photoUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validación de tamaño de archivo (1MB)
                if (file.size > 1 * 1024 * 1024) {
                    showToast("Error: El archivo es demasiado grande (máx. 1MB).");
                    e.target.value = null;
                    return;
                }

                // Guardar el archivo para subirlo después
                selectedAvatarFile = file;

                // Mostrar previsualización
                const reader = new FileReader();
                reader.onload = (event) => {
                    settingsUserAvatar.src = event.target.result;
                };
                reader.readAsDataURL(file);

                showToast("Foto lista para guardar. Haz clic en 'Guardar Cambios'.");
            }
            e.target.value = null; // Permitir seleccionar el mismo archivo de nuevo
        });
    }

    // --- PROJECT MANAGEMENT ---
    const projectsGrid = document.getElementById('projects-grid');
    const addProjectModal = document.getElementById('addProjectModal');
    const addProjectForm = document.getElementById('addProjectForm');

    document.getElementById('new-project-btn').addEventListener('click', () => {
         const projectLeaderSelect = document.getElementById('projectLeader');
        projectLeaderSelect.innerHTML = '<option value="">Seleccionar líder</option>';
        appState.teamMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name; // Guardar el nombre como valor
            option.textContent = member.name;
            if(member.id === currentUserId) option.selected = true; // Seleccionar al usuario actual
            projectLeaderSelect.appendChild(option);
        });
        addProjectForm.reset();
        document.getElementById('projectStatus').value = 'active';
        addProjectModal.classList.remove('hidden')
    });
    document.getElementById('closeAddProjectModal').addEventListener('click', () => addProjectModal.classList.add('hidden'));
    document.getElementById('cancelAddProject').addEventListener('click', () => addProjectModal.classList.add('hidden'));

    addProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newProject = {
            name: addProjectForm.projectName.value,
            description: addProjectForm.projectDescription.value,
            leader: addProjectForm.projectLeader.value,
            status: addProjectForm.projectStatus.value,
            progress: addProjectForm.projectStatus.value === 'completed' ? 100 : 0,
            pendingTasks: 0,
            totalBudget: 0,
            totalSpent: 0,
            createdAt: serverTimestamp()
        };

        try {
            const projectRef = collection(db, `artifacts/${appId}/public/data/projects`);
            const docRef = await addDoc(projectRef, newProject);

            createNotification(`creó el proyecto: ${newProject.name}`, 'fa-project-diagram', 'text-emerald-500');
            showToast("Proyecto creado exitosamente.");
            addProjectForm.reset();
            addProjectModal.classList.add('hidden');
        } catch (error) {
            console.error("Error creando proyecto:", error);
            showToast("Error al crear el proyecto.");
        }
    });

    function renderProjects() {
        if (!projectsGrid) return;
        const searchTerm = document.getElementById('project-search').value.toLowerCase();
        const statusValue = document.getElementById('project-status-filter').value;

        // Ordenar proyectos: Activos/Pendientes primero, luego por fecha
        const sortedProjects = [...appState.projects].sort((a, b) => {
            const statusOrder = (p) => (p.status === 'completed' ? 1 : 0);
            if (statusOrder(a) !== statusOrder(b)) {
                return statusOrder(a) - statusOrder(b);
            }
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });

        const filtered = sortedProjects.filter(p =>
            (p.name.toLowerCase().includes(searchTerm) || (p.description && p.description.toLowerCase().includes(searchTerm))) &&
            (statusValue === 'all' || p.status === statusValue)
        );

        projectsGrid.innerHTML = '';
        if (filtered.length === 0) {
             projectsGrid.innerHTML = `<div class="text-center col-span-full py-12 text-slate-500"><i class="fas fa-folder-open fa-3x mb-4"></i><h3 class="text-xl font-semibold">No se encontraron proyectos</h3></div>`;
             return;
        }

        filtered.forEach(project => {
             let statusClass, statusText;
            switch(project.status) {
                case 'active': statusClass = 'bg-emerald-100 text-emerald-700'; statusText = 'Activo'; break;
                case 'pending': statusClass = 'bg-amber-100 text-amber-700'; statusText = 'Pendiente'; break;
                case 'completed': statusClass = 'bg-sky-100 text-sky-700'; statusText = 'Completado'; break;
                default: statusClass = 'bg-slate-100 text-slate-700'; statusText = 'N/A';
            }
            const leader = appState.teamMembers.find(m => m.name === project.leader);
            const leaderAvatar = leader ? leader.avatar : `https://i.pravatar.cc/150?u=${project.leader || 'default'}`;
            const card = document.createElement('div');
            card.className = 'bg-white rounded-xl shadow-md p-5 project-card';
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3"><h3 class="font-bold text-lg">${project.name}</h3><span class="text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass}">${statusText}</span></div>
                <p class="text-slate-600 text-sm mb-4 h-10 overflow-hidden">${project.description || 'Sin descripción'}</p>
                <div class="mb-4"><div class="flex justify-between text-sm text-slate-500 mb-1"><span>Progreso</span><span>${project.progress}%</span></div><div class="w-full bg-slate-200 rounded-full h-2"><div class="bg-emerald-500 h-2 rounded-full" style="width: ${project.progress}%"></div></div></div>
                <div class="flex justify-between items-center"><div class="flex items-center"><img src="${leaderAvatar}" alt="${project.leader}" class="w-6 h-6 rounded-full mr-2"><span class="text-sm text-slate-600">${project.leader}</span></div>
                <button class="view-tasks-btn text-emerald-500 hover:text-emerald-600 font-medium text-sm" data-project-id="${project.id}" data-project-name="${project.name}" data-project-desc="${project.description || 'Sin descripción'}">
                    Ver Tareas
                </button>
                </div>
            `;
            projectsGrid.appendChild(card);
        });
    }
    document.getElementById('project-search').addEventListener('input', renderProjects);
    document.getElementById('project-status-filter').addEventListener('change', renderProjects);

    // --- Project Task Navigation ---
    projectsGrid.addEventListener('click', (e) => {
        const taskButton = e.target.closest('.view-tasks-btn');
        if (taskButton) {
            const { projectId, projectName, projectDesc } = taskButton.dataset;
            showProjectDetail(projectId, projectName, projectDesc);
        }
    });

    document.getElementById('back-to-projects-btn').addEventListener('click', () => {
        document.getElementById('page-project-detail').classList.add('hidden');
        document.getElementById('page-projects').classList.remove('hidden');
        appState.currentProjectId = null;
        // Detener listener de tareas
        if (appState.unsubscribeTasks) appState.unsubscribeTasks();
    });


    // --- COLLABORATOR MANAGEMENT ---

    // Función para renderizar la tabla de colaboradores
    function renderCollaboratorsTable() {
        const tableBody = document.getElementById('collaborators-table-body');
        if(!tableBody) return;

        tableBody.innerHTML = '';
        appState.teamMembers.forEach(user => {
            const row = document.createElement('tr');
            row.className = 'border-b';

            // Select para cambiar rol (solo visible para Admin)
            let roleSelect = user.profile; // Por defecto, solo texto
            if (currentUserProfile && currentUserProfile.role === 'Administrador' && user.id !== currentUserId) {
                roleSelect = `
                    <select data-user-id="${user.id}" class="role-select bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2">
                        <option value="Administrador" ${user.profile === 'Administrador' ? 'selected' : ''}>Administrador</option>
                        <option value="Colaborador" ${user.profile === 'Colaborador' ? 'selected' : ''}>Colaborador</option>
                        <option value="Visualizador" ${user.profile === 'Visualizador' ? 'selected' : ''}>Visualizador</option>
                    </select>
                `;
            } else if (user.id === currentUserId) {
                 roleSelect = `<strong>${user.profile} (Tú)</strong>`;
            }

            row.innerHTML = `
                <td class="p-4 font-medium">${user.name}</td>
                <td class="p-4 text-slate-600">${user.email}</td>
                <td class="p-4 text-slate-600">${roleSelect}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // Listener para cambios de rol
    document.getElementById('collaborators-table-body').addEventListener('change', async (e) => {
        if (e.target.classList.contains('role-select')) {
            const userIdToUpdate = e.target.dataset.userId;
            const newRole = e.target.value;

            if (!userIdToUpdate || !newRole) return;

            const userRef = doc(db, `artifacts/${appId}/public/data/team`, userIdToUpdate);
            try {
                await updateDoc(userRef, {
                    role: newRole,
                    profile: newRole // Actualizar ambos campos
                });
                const userName = appState.teamMembers.find(u => u.id === userIdToUpdate)?.name || 'un usuario';
                createNotification(`actualizó el rol de ${userName} a ${newRole}`, 'fa-user-shield', 'text-blue-500');
                showToast("Rol de usuario actualizado.");
            } catch (error) {
                console.error("Error actualizando rol:", error);
                showToast("Error al actualizar el rol.");
            }
        }
    });

    // --- Task Management Logic ---
    const addTaskModal = document.getElementById('addTaskModal');
    const addTaskForm = document.getElementById('addTaskForm');
    const taskListContainer = document.getElementById('task-list-container');

    const editTaskModal = document.getElementById('editTaskModal');
    const editTaskForm = document.getElementById('editTaskForm');
    const closeEditTaskModalBtn = document.getElementById('closeEditTaskModal');
    const cancelEditTaskBtn = document.getElementById('cancelEditTask');

    document.getElementById('new-task-btn').addEventListener('click', () => {
        const assigneeSelect = document.getElementById('taskAssignee');
        assigneeSelect.innerHTML = '<option value="">Seleccionar miembro</option>';
        appState.teamMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name; // Guardar el nombre
            option.textContent = member.name;
            if(member.id === currentUserId) option.selected = true;
            assigneeSelect.appendChild(option);
        });
        addTaskForm.reset();
        document.getElementById('taskStatus').value = 'pending';
        addTaskModal.classList.remove('hidden');
    });

    document.getElementById('closeAddTaskModal').addEventListener('click', () => addTaskModal.classList.add('hidden'));
    document.getElementById('cancelAddTask').addEventListener('click', () => addTaskModal.classList.add('hidden'));

    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const projectId = appState.currentProjectId;
        if (!projectId) {
            showToast("Error: No se ha seleccionado un proyecto.");
            return;
        }

        const newTask = {
            name: addTaskForm.taskName.value,
            assignee: addTaskForm.taskAssignee.value,
            startDate: addTaskForm.taskStartDate.value || null,
            dueDate: addTaskForm.taskDueDate.value || null,
            status: addTaskForm.taskStatus.value,
            createdAt: serverTimestamp(),
            projectId: projectId
        };

        try {
            const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`);
            await addDoc(tasksRef, newTask);
            checkAndSetProjectCompletion(projectId);

            const projectName = appState.projects.find(p => p.id === projectId)?.name || 'un proyecto';
            createNotification(`agregó la tarea: ${newTask.name} (en ${projectName})`, 'fa-tasks', 'text-sky-500');
            showToast("Tarea agregada exitosamente.");
            addTaskForm.reset();
            addTaskModal.classList.add('hidden');
        } catch (error) {
            console.error("Error agregando tarea:", error);
            showToast("Error al agregar la tarea.");
        }
    });

    if (closeEditTaskModalBtn) {
        closeEditTaskModalBtn.addEventListener('click', () => editTaskModal.classList.add('hidden'));
    }
    if (cancelEditTaskBtn) {
        cancelEditTaskBtn.addEventListener('click', () => editTaskModal.classList.add('hidden'));
    }

    if (editTaskForm) {
        editTaskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const taskId = document.getElementById('editTaskId').value;
            const projectId = document.getElementById('editTaskProjectId').value;

            if (!projectId || !taskId) {
                showToast("Error: Faltan datos de la tarea o proyecto.");
                return;
            }

            const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`, taskId);
            const updatedTaskData = {
                name: document.getElementById('editTaskName').value,
                assignee: document.getElementById('editTaskAssignee').value,
                startDate: document.getElementById('editTaskStartDate').value || null,
                dueDate: document.getElementById('editTaskDueDate').value || null,
                status: document.getElementById('editTaskStatus').value,
            };

            try {
                await updateDoc(taskRef, updatedTaskData);
                checkAndSetProjectCompletion(projectId);
                createNotification(`actualizó la tarea: ${updatedTaskData.name}`, 'fa-edit', 'text-amber-500');
                showToast("Tarea actualizada exitosamente.");
                editTaskForm.reset();
                editTaskModal.classList.add('hidden');
            } catch (error) {
                 console.error("Error actualizando tarea:", error);
                 showToast("Error al actualizar la tarea.");
            }
        });
    }

    taskListContainer.addEventListener('click', async (e) => {
        const toggleButton = e.target.closest('.toggle-task-btn');
        const editButton = e.target.closest('.edit-task-btn');
        const deleteButton = e.target.closest('.delete-task-btn');

        if (toggleButton) {
            const { taskId, currentStatus } = toggleButton.dataset;
            const newStatus = (currentStatus === 'completed' || currentStatus === 'in-progress') ? 'pending' : 'completed';
            const projectId = appState.currentProjectId;

            if (!projectId || !taskId) return;

            const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`, taskId);
            try {
                await updateDoc(taskRef, { status: newStatus });
                checkAndSetProjectCompletion(projectId);
                showToast(newStatus === 'completed' ? "Tarea completada" : "Tarea marcada como pendiente");

                if (newStatus === 'completed') {
                    const taskName = toggleButton.closest('.task-card').querySelector('p.font-medium').textContent;
                    createNotification(`completó la tarea: ${taskName}`, 'fa-check-square', 'text-emerald-500');
                }
            } catch (error) {
                console.error("Error actualizando estado de tarea:", error);
                showToast("Error al actualizar la tarea.");
            }
        }

        if (editButton) {
            const { taskId, taskName, assignee, startDate, dueDate, status } = editButton.dataset;
            openEditTaskModal(taskId, taskName, assignee, startDate, dueDate, status);
        }

        if (deleteButton) {
            const { taskId, taskName } = deleteButton.dataset;
            openDeleteModal('task', { taskId, taskName });
        }
    });


    // --- Task Functions ---
    function showProjectDetail(projectId, projectName, projectDesc) {
        document.getElementById('page-projects').classList.add('hidden');
        document.getElementById('page-project-detail').classList.remove('hidden');

        document.getElementById('detail-project-name').textContent = projectName;
        document.getElementById('detail-project-description').textContent = projectDesc;

        appState.currentProjectId = projectId;

        // Detener listener antiguo si existe
        if (appState.unsubscribeTasks) appState.unsubscribeTasks();

        // Iniciar nuevo listener para las tareas de ESTE proyecto
        const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`);
        appState.unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
            console.log("Tareas actualizadas para el proyecto:", projectId);
            const tasks = [];
            snapshot.forEach(doc => {
                tasks.push({ id: doc.id, ...doc.data() });
            });

            // Ordenar tareas: pendientes primero, luego por fecha de creación
            tasks.sort((a, b) => {
                const statusOrder = (t) => (t.status === 'completed' ? 1 : 0);
                if (statusOrder(a) !== statusOrder(b)) {
                    return statusOrder(a) - statusOrder(b);
                }
                return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
            });

            renderTasks(tasks);
            updateProjectProgress(projectId, tasks);

        }, (error) => console.error("Error en listener de Tareas:", error));
    }

    function openEditTaskModal(taskId, taskName, assignee, startDate, dueDate, status) {
        const projectId = appState.currentProjectId;

        const assigneeSelect = document.getElementById('editTaskAssignee');
        assigneeSelect.innerHTML = '<option value="">Seleccionar miembro</option>';
        appState.teamMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.name;
            if (member.name === assignee) {
                option.selected = true;
            }
            assigneeSelect.appendChild(option);
        });

        document.getElementById('editTaskId').value = taskId;
        document.getElementById('editTaskProjectId').value = projectId;
        document.getElementById('editTaskName').value = taskName;
        document.getElementById('editTaskStartDate').value = startDate || '';
        document.getElementById('editTaskDueDate').value = dueDate || '';
        document.getElementById('editTaskStatus').value = status;

        editTaskModal.classList.remove('hidden');
    }

    function renderTasks(tasks) {
        taskListContainer.innerHTML = '';
        if (tasks.length === 0) {
            taskListContainer.innerHTML = `<div class="text-center col-span-full py-12 text-slate-500"><i class="fas fa-check-circle fa-3x mb-4"></i><h3 class="text-xl font-semibold">No hay tareas</h3><p>¡Agrega la primera tarea para este proyecto!</p></div>`;
            return;
        }

        tasks.forEach(task => {
            const assignee = appState.teamMembers.find(m => m.name === task.assignee);
            const assigneeAvatar = assignee ? assignee.avatar : `https://i.pravatar.cc/150?u=${task.assignee || 'default'}`;

            let iconClass, borderColor;
            if (task.status === 'completed') {
                iconClass = 'fa-check-square text-emerald-500';
                borderColor = 'border-emerald-500';
            } else if (task.status === 'in-progress') {
                iconClass = 'fa-minus-square text-sky-500';
                borderColor = 'border-sky-500';
            } else {
                iconClass = 'fa-square';
                borderColor = 'border-slate-200';
            }

            const taskCard = document.createElement('div');
            taskCard.className = `bg-white rounded-lg shadow-sm p-4 flex items-center justify-between border-l-4 ${borderColor} ${task.status === 'completed' ? 'task-card completed' : 'task-card'}`;

            taskCard.innerHTML = `
                <div class="flex items-center flex-1 min-w-0">
                    <button class="toggle-task-btn text-xl mr-4 text-slate-300 hover:text-emerald-500" data-task-id="${task.id}" data-current-status="${task.status}">
                        <i class="fas ${iconClass}"></i>
                    </button>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-slate-800 truncate">${task.name}</p>
                        <div class="flex items-center text-xs text-slate-500 mt-1 flex-wrap">
                            <i class="fas fa-play-circle mr-1.5 text-sky-500"></i> <span class="mr-2">Inicio: ${task.startDate || 'N/A'}</span>
                            <i class="fas fa-calendar-alt mr-1.5 text-rose-500"></i> <span>Final: ${task.dueDate || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center flex-shrink-0 ml-4">
                    <button class="edit-task-btn text-slate-400 hover:text-emerald-500"
                        data-task-id="${task.id}"
                        data-task-name="${task.name}"
                        data-assignee="${task.assignee || ''}"
                        data-start-date="${task.startDate || ''}"
                        data-due-date="${task.dueDate || ''}"
                        data-status="${task.status}"
                        title="Editar Tarea">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-task-btn text-slate-400 hover:text-rose-500 ml-2"
                        data-task-id="${task.id}"
                        data-task-name="${task.name}"
                        title="Eliminar Tarea">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${assignee ? `<img src="${assigneeAvatar}" alt="${task.assignee}" class="w-8 h-8 rounded-full ml-3 border-2 border-white object-cover" title="Asignado a: ${task.assignee}">` : '<div class="w-8 h-8 ml-3"></div>'}
                </div>
            `;
            taskListContainer.appendChild(taskCard);
        });
    }

    async function updateProjectProgress(projectId, tasks) {
        if (!projectId || !tasks) return;

        const projectRef = doc(db, `artifacts/${appId}/public/data/projects`, projectId);

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.status === 'completed').length;
        const pendingTasksCount = totalTasks - completedTasks;

        let newProgress = 0;
        if (totalTasks > 0) {
            newProgress = Math.round((completedTasks / totalTasks) * 100);
        }

        try {
            await updateDoc(projectRef, {
                progress: newProgress,
                pendingTasks: pendingTasksCount
            });
            console.log("Progreso del proyecto actualizado.");
        } catch (error) {
            console.error("Error actualizando progreso:", error);
        }
    }

    async function checkAndSetProjectCompletion(projectId) {
        const projectRef = doc(db, `artifacts/${appId}/public/data/projects`, projectId);
        const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`);

        try {
            const tasksSnap = await getDocs(tasksRef);
            const totalTasks = tasksSnap.size;

            if (totalTasks === 0) {
                // Si no hay tareas, el proyecto no puede considerarse "Completado" a menos que se decida lo contrario.
                // Por ahora, lo mantenemos como activo o pendiente.
                return;
            }

            let allTasksCompleted = true;
            tasksSnap.forEach(doc => {
                if (doc.data().status !== 'completed') {
                    allTasksCompleted = false;
                }
            });

            const projectDoc = await getDoc(projectRef);
            const currentStatus = projectDoc.data().status;

            if (allTasksCompleted && currentStatus !== 'completed') {
                await updateDoc(projectRef, { status: 'completed' });
                createNotification(`el proyecto: ${projectDoc.data().name} se ha completado automáticamente.`, 'fa-check-circle', 'text-sky-500');
            } else if (!allTasksCompleted && currentStatus === 'completed') {
                await updateDoc(projectRef, { status: 'active' });
                createNotification(`el proyecto: ${projectDoc.data().name} se ha reactivado automáticamente.`, 'fa-history', 'text-amber-500');
            }
        } catch (error) {
            console.error("Error verificando la finalización del proyecto:", error);
        }
    }

    // --- LÓGICA DE PRESUPUESTOS ---

    const setBudgetModal = document.getElementById('setBudgetModal');
    const setBudgetForm = document.getElementById('setBudgetForm');
    const addExpenseModal = document.getElementById('addExpenseModal');
    const addExpenseForm = document.getElementById('addExpenseForm');
    const deleteModal = document.getElementById('deleteConfirmationModal'); // Modal genérico

    document.getElementById('closeSetBudgetModal').addEventListener('click', () => setBudgetModal.classList.add('hidden'));
    document.getElementById('cancelSetBudget').addEventListener('click', () => setBudgetModal.classList.add('hidden'));

    setBudgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const projectId = document.getElementById('budgetProjectId').value;
        const totalBudget = parseFloat(document.getElementById('projectTotalBudget').value);

        if (!projectId || isNaN(totalBudget)) {
            showToast("Error: Datos inválidos.");
            return;
        }

        const projectRef = doc(db, `artifacts/${appId}/public/data/projects`, projectId);
        try {
            await updateDoc(projectRef, { totalBudget: totalBudget });

            const projectName = document.getElementById('budgetProjectName').textContent;
            createNotification(`asignó un presupuesto de ${formatCurrency(totalBudget)} a ${projectName}`, 'fa-dollar-sign', 'text-emerald-500');
            showToast("Presupuesto asignado exitosamente.");
            setBudgetForm.reset();
            setBudgetModal.classList.add('hidden');
        } catch (error) {
            console.error("Error asignando presupuesto:", error);
            showToast("Error al asignar el presupuesto.");
        }
    });

    document.getElementById('closeAddExpenseModal').addEventListener('click', () => addExpenseModal.classList.add('hidden'));
    document.getElementById('cancelAddExpense').addEventListener('click', () => addExpenseModal.classList.add('hidden'));

    addExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const projectId = document.getElementById('expenseProjectId').value;
        const amount = parseFloat(addExpenseForm.expenseAmount.value);

        if (!projectId || isNaN(amount)) {
            showToast("Error: Datos inválidos.");
            return;
        }

        const newExpense = {
            description: addExpenseForm.expenseDescription.value,
            amount: amount,
            category: addExpenseForm.expenseCategory.value,
            date: addExpenseForm.expenseDate.value,
            status: addExpenseForm.expenseStatus.value,
            createdAt: serverTimestamp(),
            projectId: projectId
        };

        try {
            const expensesRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/expenses`);
            await addDoc(expensesRef, newExpense);

            const actionText = newExpense.status === 'realizado' ? 'registró un gasto' : 'agregó una cotización';
            const projectName = appState.projects.find(p => p.id === projectId)?.name || 'un proyecto';
            createNotification(`${actionText} de ${formatCurrency(newExpense.amount)} en ${projectName}`, 'fa-file-invoice-dollar', 'text-amber-500');
            showToast("Gasto registrado exitosamente.");
            addExpenseForm.reset();
            addExpenseModal.classList.add('hidden');
        } catch (error) {
            console.error("Error registrando gasto:", error);
            showToast("Error al registrar el gasto.");
        }
    });

    // Botones de cancelar en modal de borrado
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.classList.add('hidden'));

    // Botón de confirmar borrado (lógica movida a openDeleteModal)
    document.getElementById('confirmDeleteBtn').onclick = null;

    function renderBudgetsTable() {
        const tableBody = document.getElementById('budgets-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (appState.projects.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay proyectos.</td></tr>';
            return;
        }

        appState.projects.forEach(project => {
            const totalBudget = project.totalBudget || 0;
            const totalSpent = project.totalSpent || 0; // Este campo se actualiza por el listener de gastos
            const remaining = totalBudget - totalSpent;

            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-slate-50';
            row.innerHTML = `
                <td class="p-4 font-medium">${project.name}</td>
                <td class="p-4 text-slate-600">${formatCurrency(totalBudget)}</td>
                <td class="p-4 text-slate-600">${formatCurrency(totalSpent)}</td>
                <td class="p-4 font-medium ${remaining < 0 ? 'text-rose-600' : 'text-slate-800'}">${formatCurrency(remaining)}</td>
                <td class="p-4 space-x-2">
                    <button class="view-expenses-btn text-emerald-500 hover:text-emerald-600 font-medium text-sm" data-project-id="${project.id}" data-project-name="${project.name}">
                        Ver Gastos
                    </button>
                    <button class="set-budget-btn text-sky-500 hover:text-sky-600 font-medium text-sm" data-project-id="${project.id}" data-project-name="${project.name}" data-current-budget="${totalBudget}">
                        Asignar Pres.
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    document.getElementById('budgets-table-body').addEventListener('click', (e) => {
        const setBudgetBtn = e.target.closest('.set-budget-btn');
        const viewExpensesBtn = e.target.closest('.view-expenses-btn');

        if (setBudgetBtn) {
            const { projectId, projectName, currentBudget } = setBudgetBtn.dataset;
            document.getElementById('budgetProjectId').value = projectId;
            document.getElementById('budgetProjectName').textContent = projectName;
            document.getElementById('projectTotalBudget').value = currentBudget > 0 ? currentBudget : '';
            setBudgetModal.classList.remove('hidden');
        }

        if (viewExpensesBtn) {
            const { projectId, projectName } = viewExpensesBtn.dataset;
            showBudgetDetail(projectId, projectName);
        }
    });

    function showBudgetDetail(projectId, projectName) {
        document.getElementById('page-budgets').classList.add('hidden');
        document.getElementById('page-budget-detail').classList.remove('hidden');

        document.getElementById('detail-budget-project-name').textContent = projectName;
        appState.currentBudgetDetailProjectId = projectId;

        // Detener listener antiguo si existe
        if (appState.unsubscribeExpenses) appState.unsubscribeExpenses();

        // Iniciar nuevo listener para los gastos de ESTE proyecto
        const expensesRef = collection(db, `artifacts/${appId}/public/data/projects/${projectId}/expenses`);
        appState.unsubscribeExpenses = onSnapshot(expensesRef, (snapshot) => {
            console.log("Gastos actualizados para el proyecto:", projectId);
            const expenses = [];
            snapshot.forEach(doc => {
                expenses.push({ id: doc.id, ...doc.data() });
            });

            // Ordenar por fecha (más reciente primero)
            expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

            renderExpensesTable(expenses);
            updateBudgetDetailSummary(projectId, expenses);

        }, (error) => console.error("Error en listener de Gastos:", error));
    }

    document.getElementById('back-to-budgets-btn').addEventListener('click', () => {
        document.getElementById('page-budget-detail').classList.add('hidden');
        document.getElementById('page-budgets').classList.remove('hidden');
        appState.currentBudgetDetailProjectId = null;
        // Detener listener de gastos
        if (appState.unsubscribeExpenses) appState.unsubscribeExpenses();
    });

    document.getElementById('new-expense-btn').addEventListener('click', () => {
        document.getElementById('expenseProjectId').value = appState.currentBudgetDetailProjectId;
        addExpenseForm.reset();
        document.getElementById('expenseDate').valueAsDate = new Date();
        addExpenseModal.classList.remove('hidden');
    });

    function renderExpensesTable(expenses) {
        const tableBody = document.getElementById('expense-list-table');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (expenses.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500">Aún no se han registrado movimientos.</td></tr>';
            return;
        }

        expenses.forEach(expense => {
            const row = document.createElement('tr');
            row.className = 'border-b';

            let statusBadge = '';
            let actionButton = '';

            if (expense.status === 'cotizado') {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Cotizado</span>`;
                actionButton = `
                    <button class="convert-expense-btn text-emerald-500 hover:text-emerald-700" data-expense-id="${expense.id}" data-expense-desc="${expense.description}" title="Marcar como Gasto Real">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="delete-expense-btn text-rose-500 hover:text-rose-700 ml-2" data-expense-id="${expense.id}" data-expense-desc="${expense.description}" title="Eliminar Cotización">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            } else { // 'realizado'
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Realizado</span>`;
                actionButton = `
                    <button class="delete-expense-btn text-rose-500 hover:text-rose-700" data-expense-id="${expense.id}" data-expense-desc="${expense.description}" title="Eliminar Gasto">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            }

            row.innerHTML = `
                <td class="p-4 text-slate-600">${expense.date}</td>
                <td class="p-4 font-medium">${expense.description}</td>
                <td class="p-4 text-slate-600">${expense.category}</td>
                <td class="p-4 text-slate-600">${formatCurrency(expense.amount)}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4">${actionButton}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    document.getElementById('expense-list-table').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-expense-btn');
        const convertBtn = e.target.closest('.convert-expense-btn');
        const projectId = appState.currentBudgetDetailProjectId;

        if (deleteBtn) {
            const { expenseId, expenseDesc } = deleteBtn.dataset;
            openDeleteModal('expense', { expenseId, expenseDesc });
        }

        if (convertBtn) {
            const { expenseId, expenseDesc } = convertBtn.dataset;
            if (!expenseId || !projectId) {
                showToast("Error al convertir la cotización.");
                return;
            }

            const expenseRef = doc(db, `artifacts/${appId}/public/data/projects/${projectId}/expenses`, expenseId);
            try {
                await updateDoc(expenseRef, {
                    status: 'realizado',
                    date: new Date().toISOString().split('T')[0] // Actualiza la fecha
                });
                createNotification(`aprobó la cotización: ${expenseDesc}`, 'fa-check-circle', 'text-green-500');
                showToast("Cotización marcada como Gasto Real.");
            } catch (error) {
                console.error("Error al convertir gasto:", error);
                showToast("Error al convertir la cotización.");
            }
        }
    });

    async function updateBudgetDetailSummary(projectId, expenses) {
        const project = appState.projects.find(p => p.id === projectId);
        if (!project) return;

        const totalBudget = project.totalBudget || 0;

        const totalSpent = expenses.reduce((sum, exp) => {
            return exp.status === 'realizado' ? sum + (parseFloat(exp.amount) || 0) : sum;
        }, 0);

        const totalCotizado = expenses.reduce((sum, exp) => {
            return exp.status === 'cotizado' ? sum + (parseFloat(exp.amount) || 0) : sum;
        }, 0);

        const remaining = totalBudget - totalSpent;

        // Actualizar el estado del proyecto en Firestore (para la tabla principal)
        const projectRef = doc(db, `artifacts/${appId}/public/data/projects`, projectId);
        try {
            await updateDoc(projectRef, { totalSpent: totalSpent });
        } catch (error) {
            console.error("Error actualizando totalSpent del proyecto:", error);
        }

        // Actualizar la UI de detalle
        document.getElementById('detail-budget-total').textContent = formatCurrency(totalBudget);
        document.getElementById('detail-budget-spent').textContent = formatCurrency(totalSpent);
        document.getElementById('detail-budget-quoted').textContent = formatCurrency(totalCotizado);
        document.getElementById('detail-budget-remaining').textContent = formatCurrency(remaining);
    }

    // --- LÓGICA DE REPORTES (Requiere carga de datos) ---

    let reportChartInstance = null;

    document.getElementById('print-report-btn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('hidden');
        document.querySelector('header').classList.add('hidden');
        document.getElementById('print-report-btn').classList.add('hidden');
        document.body.classList.remove('bg-slate-100');
        document.getElementById('page-container').classList.remove('p-6');
        window.print();
        document.getElementById('sidebar').classList.remove('hidden');
        document.querySelector('header').classList.remove('hidden');
        document.getElementById('print-report-btn').classList.remove('hidden');
        document.body.classList.add('bg-slate-100');
        document.getElementById('page-container').classList.add('p-6');
    });


    async function generateReports() {
        const budgetTableBody = document.getElementById('report-budget-summary-table');
        const categoryChartContainer = document.getElementById('category-chart-container');

        if (!budgetTableBody || !categoryChartContainer) return;

        budgetTableBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i> Generando reportes...</td></tr>';
        if (reportChartInstance) {
            reportChartInstance.destroy();
            reportChartInstance = null;
        }

        let allExpenses = [];
        let allProjectsData = [];

        // Tuvimos que hacer un bucle async para obtener todas las sub-colecciones de gastos
        for (const project of appState.projects) {
            const expensesRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/expenses`);
            const expensesSnap = await getDocs(expensesRef);
            const projectExpenses = [];
            expensesSnap.forEach(doc => {
                projectExpenses.push(doc.data());
            });

            allExpenses.push(...projectExpenses);

            const totalQuoted = projectExpenses.reduce((sum, exp) => {
                return exp.status === 'cotizado' ? sum + (parseFloat(exp.amount) || 0) : sum;
            }, 0);

            const totalSpent = project.totalSpent || 0; // Usar el valor ya calculado
            const totalBudget = project.totalBudget || 0;
            const remaining = totalBudget - totalSpent;

            allProjectsData.push({
                name: project.name,
                totalBudget,
                totalQuoted,
                totalSpent,
                remaining
            });
        }

        renderBudgetSummaryReport(allProjectsData);
        renderCategoryChartReport(allExpenses, categoryChartContainer);
    }

    function renderBudgetSummaryReport(projectsData) {
        const tableBody = document.getElementById('report-budget-summary-table');
        tableBody.innerHTML = '';

        if (projectsData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-500">No hay datos de proyectos.</td></tr>';
            return;
        }

        projectsData.forEach(data => {
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-4 font-medium">${data.name}</td>
                <td class="p-4 text-slate-600">${formatCurrency(data.totalBudget)}</td>
                <td class="p-4 text-slate-600">${formatCurrency(data.totalQuoted)}</td>
                <td class="p-4 text-slate-600">${formatCurrency(data.totalSpent)}</td>
                <td class="p-4 font-medium ${data.remaining < 0 ? 'text-rose-600' : 'text-slate-800'}">${formatCurrency(data.remaining)}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function renderCategoryChartReport(allExpenses, container) {
        const expensesRealizados = allExpenses.filter(exp => exp.status === 'realizado');
        const categoryTotals = expensesRealizados.reduce((acc, exp) => {
            const category = exp.category || 'Sin Categoría';
            const amount = parseFloat(exp.amount) || 0;
            if (!acc[category]) acc[category] = 0;
            acc[category] += amount;
            return acc;
        }, {});

        const labels = Object.keys(categoryTotals);
        const data = Object.values(categoryTotals);
        const chartColors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#f43f5e', '#06b6d4'];

        if (reportChartInstance) {
            reportChartInstance.destroy();
            reportChartInstance = null;
        }

        container.innerHTML = '';

        if (labels.length === 0) {
             container.innerHTML = '<p class="text-center text-slate-500 py-12">No hay gastos realizados.</p>';
             return;
        }

        const canvas = document.createElement('canvas');
        canvas.id = 'reportCategoryChart';
        container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        reportChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gasto por Categoría',
                    data: data,
                    backgroundColor: chartColors.slice(0, labels.length),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${formatCurrency(context.parsed)}`;
                            }
                        }
                    }
                }
            }
        });
    }


    // --- Renderizar Notificaciones ---
    function renderNotifications(notifications) {
        const notificationList = document.getElementById('notification-list');
        const notificationCountBadge = document.getElementById('notification-count');

        if (!notificationList || !notificationCountBadge || !currentUserId) return;

        let unreadCount = 0;
        notificationList.innerHTML = '';

        if (notifications.length === 0) {
            notificationList.innerHTML = `
                <div class="p-6 text-center text-slate-500">
                    <i class="fas fa-check-circle text-2xl mb-2 text-slate-400"></i>
                    <p class="text-sm">No hay notificaciones.</p>
                </div>`;
            notificationCountBadge.classList.add('hidden');
            return;
        }

        notifications.forEach(notif => {
            const isRead = notif.readBy && notif.readBy.includes(currentUserId);
            if (!isRead) {
                unreadCount++;
            }

            const timeAgo = notif.timestamp ? formatTimeAgo(notif.timestamp.toDate()) : '...';

            const item = document.createElement('div');
            item.className = `notification-item p-4 border-b border-slate-100 ${!isRead ? 'bg-emerald-50' : 'bg-white'}`;
            item.dataset.id = notif.id; // Guardar ID para marcar como leída
            item.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="mt-1">
                        <i class="fas ${notif.icon || 'fa-info-circle'} ${notif.iconColor || 'text-slate-500'}"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-sm text-slate-700">${notif.message}</p>
                        <span class="text-xs text-slate-500">${timeAgo}</span>
                    </div>
                </div>
            `;
            notificationList.appendChild(item);
        });

        if (unreadCount > 0) {
            notificationCountBadge.classList.remove('hidden');
            notificationCountBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        } else {
            notificationCountBadge.classList.add('hidden');
        }
    }

    function formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return `Hace ${Math.floor(interval)} años`;
        interval = seconds / 2592000;
        if (interval > 1) return `Hace ${Math.floor(interval)} meses`;
        interval = seconds / 86400;
        if (interval > 1) return `Hace ${Math.floor(interval)} días`;
        interval = seconds / 3600;
        if (interval > 1) return `Hace ${Math.floor(interval)} horas`;
        interval = seconds / 60;
        if (interval > 1) return `Hace ${Math.floor(interval)} min`;
        return `Hace ${Math.floor(seconds)} seg`;
    }

    // --- CHARTS & DASHBOARD ---

    function renderRecentProjects() {
        const tableBody = document.getElementById('recent-projects-table');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const recent = [...appState.projects].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);

        if (recent.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay proyectos recientes.</td></tr>';
            return;
        }

        recent.forEach(project => {
            let statusClass, statusText;
            switch(project.status) {
                case 'active': statusClass = 'bg-emerald-100 text-emerald-700'; statusText = 'Activo'; break;
                case 'pending': statusClass = 'bg-amber-100 text-amber-700'; statusText = 'Pendiente'; break;
                case 'completed': statusClass = 'bg-sky-100 text-sky-700'; statusText = 'Completado'; break;
                default: statusClass = 'bg-slate-100 text-slate-700'; statusText = 'N/A';
            }
            const leader = appState.teamMembers.find(m => m.name === project.leader);
            const leaderAvatar = leader ? leader.avatar : `https://i.pravatar.cc/150?u=${project.leader || 'default'}`;
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-slate-50';
            row.innerHTML = `
                <td class="p-4 font-medium">${project.name}</td>
                <td class="p-4"><div class="flex items-center"><img src="${leaderAvatar}" alt="${project.leader}" class="w-6 h-6 rounded-full mr-2"><span class="text-sm text-slate-600">${project.leader || 'N/A'}</span></div></td>
                <td class="p-4"><div class="w-full bg-slate-200 rounded-full h-2"><div class="bg-emerald-500 h-2 rounded-full" style="width: ${project.progress || 0}%"></div></div></td>
                <td class="p-4"><span class="text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass}">${statusText}</span></td>
                <td class="p-4">
                    <button class="view-tasks-btn text-emerald-500 hover:text-emerald-600"
                        data-project-id="${project.id}"
                        data-project-name="${project.name}"
                        data-project-desc="${project.description || 'Sin descripción'}">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    // Listener para botones de ver en tabla de recientes
    document.getElementById('recent-projects-table').addEventListener('click', (e) => {
        const taskButton = e.target.closest('.view-tasks-btn');
        if (taskButton) {
            const { projectId, projectName, projectDesc } = taskButton.dataset;
            showProjectDetail(projectId, projectName, projectDesc);
        }
    });

    async function calculateAndDisplayDelayedTasks() {
        let delayedTasksCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const project of appState.projects) {
            if (project.status === 'completed') continue;

            const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks`);
            const tasksSnap = await getDocs(tasksRef);

            tasksSnap.forEach(doc => {
                const task = doc.data();
                if (task.dueDate && task.status !== 'completed') {
                    const dueDate = new Date(task.dueDate);
                    if (dueDate < today) {
                        delayedTasksCount++;
                    }
                }
            });
        }

        const delayedCountElement = document.getElementById('delayed-projects-count');
        if (delayedCountElement) {
            delayedCountElement.textContent = delayedTasksCount;
        }
    }

    function updateDashboardStats() {
        if (!document.getElementById('active-projects-count')) return;

        const totalPendingTasks = appState.projects.reduce((sum, project) => {
            if (project.status === 'active' || project.status === 'pending') {
                return sum + (project.pendingTasks || 0);
            }
            return sum;
        }, 0);

        document.getElementById('active-projects-count').textContent = appState.projects.filter(p => p.status === 'active').length;
        document.getElementById('pending-tasks-count').textContent = totalPendingTasks;
        document.getElementById('completed-projects-count').textContent = appState.projects.filter(p => p.status === 'completed').length;

        // Lógica de retraso (simple)
        // Esta lógica ahora es más compleja porque las tareas están en subcolecciones
        // Por ahora, lo dejaremos en 0 para simplificar.
        document.getElementById('delayed-projects-count').textContent = '...';
        calculateAndDisplayDelayedTasks();

        // Actualizar gráficos
        initializeCharts();
    }

    function initializeCharts() {
        const progressCtx = document.getElementById('progressChart')?.getContext('2d');
        const statusCtx = document.getElementById('statusChart')?.getContext('2d');
        if (!progressCtx || !statusCtx) return;

        const active = appState.projects.filter(p => p.status === 'active').length;
        const pending = appState.projects.filter(p => p.status === 'pending').length;
        const completed = appState.projects.filter(p => p.status === 'completed').length;

        const progressData = {
            labels: appState.projects.slice(0, 5).map(p => p.name),
            datasets: [{
                label: 'Progreso (%)',
                data: appState.projects.slice(0, 5).map(p => p.progress || 0),
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        };

        const statusData = {
            labels: ['Activo', 'Pendiente', 'Completado'],
            datasets: [{
                label: 'Estado de Proyectos',
                data: [active, pending, completed],
                backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(245, 158, 11, 0.6)', 'rgba(14, 165, 233, 0.6)'],
                borderColor: ['rgba(16, 185, 129, 1)', 'rgba(245, 158, 11, 1)', 'rgba(14, 165, 233, 1)'],
                borderWidth: 1
            }]
        };

        if (progressChartInstance) progressChartInstance.destroy();
        progressChartInstance = new Chart(progressCtx, { type: 'bar', data: progressData, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });

        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(statusCtx, { type: 'doughnut', data: statusData, options: { responsive: true, maintainAspectRatio: false } });
    }

    // --- GANTT CHART (Requiere carga de datos) ---
    const todayLinePlugin = {
        id: 'todayLine',
        beforeDraw: (chart) => {
            const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayMs = today.getTime();
            if (todayMs >= x.min && todayMs <= x.max) {
                const xCoordinate = x.getPixelForValue(todayMs);
                ctx.save();
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#f43f5e';
                ctx.setLineDash([6, 6]);
                ctx.moveTo(xCoordinate, top);
                ctx.lineTo(xCoordinate, bottom);
                ctx.stroke();
                ctx.fillStyle = '#f43f5e';
                ctx.font = '12px Inter';
                ctx.textAlign = 'center';
                ctx.fillText('HOY', xCoordinate, top - 10);
                ctx.restore();
            }
        }
    };

    async function renderGanttChart() {
        const chartCanvas = document.getElementById('ganttChart');
        const chartContainer = document.getElementById('ganttChartContainer');
        if (!chartCanvas || !chartContainer) return;

        if (ganttChartInstance) {
            ganttChartInstance.destroy();
            ganttChartInstance = null;
        }

        chartContainer.innerHTML = '<div class="text-center py-12 text-slate-500"><i class="fas fa-spinner fa-spin fa-2x"></i><p class="mt-2">Cargando cronograma...</p></div>';

        let allTasks = [];
        // Tuvimos que hacer un bucle async para obtener todas las sub-colecciones de tareas
        for (const project of appState.projects) {
            const tasksRef = collection(db, `artifacts/${appId}/public/data/projects/${project.id}/tasks`);
            const tasksSnap = await getDocs(tasksRef);
            tasksSnap.forEach(doc => {
                allTasks.push({ ...doc.data(), projectId: project.id, projectName: project.name });
            });
        }

        const validTasks = allTasks.filter(t => t.startDate && t.dueDate && new Date(t.startDate) <= new Date(t.dueDate) && !isNaN(new Date(t.startDate).getTime()) && !isNaN(new Date(t.dueDate).getTime()));
        validTasks.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        if (validTasks.length === 0) {
             chartContainer.innerHTML = `<div class="text-center py-12 text-slate-500"><i class="fas fa-calendar-times fa-3x mb-4"></i><h3 class="text-xl font-semibold">No hay tareas planificadas</h3></div>`;
             return;
        }

        // Restaurar el canvas si fue eliminado
        if (!document.getElementById('ganttChart')) {
            const newCanvas = document.createElement('canvas');
            newCanvas.id = 'ganttChart';
            chartContainer.innerHTML = '';
            chartContainer.appendChild(newCanvas);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let minDate = new Date(validTasks[0].startDate);
        let maxDate = new Date(validTasks[validTasks.length - 1].dueDate);

        const ONE_DAY = 24 * 60 * 60 * 1000;
        const THIRTY_DAYS = 30 * ONE_DAY;
        if (maxDate.getTime() - minDate.getTime() < THIRTY_DAYS) {
            const centerTime = (minDate.getTime() + maxDate.getTime()) / 2;
            minDate = new Date(centerTime - (THIRTY_DAYS / 2));
            maxDate = new Date(centerTime + (THIRTY_DAYS / 2));
        }

        const chartData = validTasks.map(task => {
            const startDate = new Date(task.startDate);
            const dueDate = new Date(task.dueDate);
            let color = (task.status === 'completed') ? '#10b981' : (dueDate < today ? '#f43f5e' : '#f59e0b');
            return {
                yLabel: `${task.name} (${task.projectName})`,
                xStart: startDate.getTime(),
                xEnd: dueDate.getTime(),
                backgroundColor: color,
                data: [[startDate.getTime(), dueDate.getTime()]],
                task: task
            };
        });

        const data = {
            labels: chartData.map(d => d.yLabel),
            datasets: [{
                label: 'Duración de Tarea',
                data: chartData.map(d => ({ x: d.data[0], y: d.yLabel })),
                backgroundColor: chartData.map(d => d.backgroundColor),
                borderWidth: 5, barPercentage: 0.8, categoryPercentage: 0.8,
                parsing: { xAxisKey: 'x', yAxisKey: 'y' },
                borderRadius: 4
            }]
        };

        const options = {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => chartData[items[0].dataIndex].task.name,
                        label: (item) => {
                            const taskInfo = chartData[item.dataIndex].task;
                            return [
                                `Proyecto: ${taskInfo.projectName}`,
                                `Asignado: ${taskInfo.assignee || 'N/A'}`,
                                `Inicio: ${new Date(taskInfo.startDate).toLocaleDateString()}`,
                                `Vencimiento: ${new Date(taskInfo.dueDate).toLocaleDateString()}`,
                                `Estado: ${taskInfo.status}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                    min: minDate.getTime(),
                    max: maxDate.getTime(),
                    position: 'top',
                    grid: { drawOnChartArea: true, color: 'rgba(0, 0, 0, 0.1)' }
                },
                y: { grid: { drawOnChartArea: false } }
            }
        };

        chartContainer.style.height = `${Math.max(400, validTasks.length * 40 + 100)}px`;
        const ctx = document.getElementById('ganttChart').getContext('2d');
        ganttChartInstance = new Chart(ctx, { type: 'bar', data: data, options: options, plugins: [todayLinePlugin] });
    }

    // --- MAIN UI INITIALIZATION FUNCTION ---
    function initializeAppUI() {
        const user = currentUserProfile;
        if (!user) return;

        document.getElementById('header-user-name').textContent = user.name;
        document.getElementById('header-user-role').textContent = user.role;
        document.getElementById('header-user-avatar').src = user.avatar;
        document.getElementById('settings-user-avatar').src = user.avatar;
        document.getElementById('profile-name').value = user.name;
        document.getElementById('profile-email').value = user.email;
        document.getElementById('profile-role').value = user.role;

        if (user.role === 'Administrador') {
            document.getElementById('collaborator-management-section').classList.remove('hidden');
        } else {
             document.getElementById('collaborator-management-section').classList.add('hidden');
        }

        // Cargar y renderizar todo
        attachDataListeners();
    }

    // --- MODAL DE BORRADO GENÉRICO ---
    function openDeleteModal(type, data) {
        const { taskId, taskName, expenseId, expenseDesc } = data;
        const title = document.getElementById('deleteModalTitle');
        const message = document.getElementById('deleteModalMessage');
        const confirmBtn = document.getElementById('confirmDeleteBtn');

        if (type === 'task') {
            title.textContent = "¿Eliminar esta tarea?";
            message.innerHTML = `Se eliminará permanentemente la tarea: <strong>${taskName}</strong>.`;
            confirmBtn.onclick = async () => {
                const projectId = appState.currentProjectId;
                const taskRef = doc(db, `artifacts/${appId}/public/data/projects/${projectId}/tasks`, taskId);
                try {
                    await deleteDoc(taskRef);
                    checkAndSetProjectCompletion(projectId);
                    createNotification(`eliminó la tarea: ${taskName}`, 'fa-trash', 'text-rose-500');
                    showToast("Tarea eliminada.");
                    deleteModal.classList.add('hidden');
                } catch (e) {
                    console.error("Error eliminando tarea:", e);
                    showToast("Error al eliminar la tarea.");
                }
            };
        }

        if (type === 'expense') {
            title.textContent = "¿Eliminar este movimiento?";
            message.innerHTML = `Se eliminará permanentemente: <strong>${expenseDesc}</strong>.`;
            confirmBtn.onclick = async () => {
                const expenseRef = doc(db, `artifacts/${appId}/public/data/projects/${appState.currentBudgetDetailProjectId}/expenses`, expenseId);
                 try {
                    await deleteDoc(expenseRef);
                    createNotification(`eliminó el gasto/cotización: ${expenseDesc}`, 'fa-trash', 'text-rose-500');
                    showToast("Movimiento eliminado.");
                    deleteModal.classList.add('hidden');
                } catch (e) {
                    console.error("Error eliminando gasto:", e);
                    showToast("Error al eliminar el movimiento.");
                }
            };
        }

        deleteModal.classList.remove('hidden');
    }

    // --- NAVIGATION & EVENT LISTENERS ---
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('page-title');
    const sidebar = document.getElementById('sidebar');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.dataset.page;

            if (pageId !== 'reports' && reportChartInstance) {
                reportChartInstance.destroy(); reportChartInstance = null;
            }
            if (pageId !== 'calendar' && ganttChartInstance) {
                ganttChartInstance.destroy(); ganttChartInstance = null;
            }

            pages.forEach(page => page.classList.add('hidden'));
            document.getElementById('page-project-detail').classList.add('hidden');
            document.getElementById('page-budget-detail').classList.add('hidden');

            document.getElementById(`page-${pageId}`).classList.remove('hidden');

            navLinks.forEach(nav => {
                nav.classList.remove('bg-emerald-500', 'text-white', 'font-semibold');
                nav.classList.add('text-slate-300', 'hover:bg-slate-700', 'hover:text-white');
            });
            link.classList.add('bg-emerald-500', 'text-white', 'font-semibold');
            link.classList.remove('text-slate-300', 'hover:bg-slate-700', 'hover:text-white');

            pageTitle.textContent = link.textContent.trim();
            sidebar.classList.remove('open');

            if (pageId === 'calendar') {
                renderGanttChart();
            }
            if (pageId === 'budgets') {
                renderBudgetsTable();
            }
            if (pageId === 'reports') {
                generateReports();
            }
        });
    });

    document.getElementById('view-all-projects').addEventListener('click', () => {
         document.querySelector('.nav-link[data-page="projects"]').click();
    });

    document.getElementById('menu-btn').addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    const notifBtn = document.getElementById('notification-btn');
    const notifDropdown = document.getElementById('notification-dropdown');
    const markAllReadBtn = document.getElementById('mark-all-read-btn');

    notifBtn.addEventListener('click', () => {
        notifDropdown.classList.toggle('hidden');
        if (!notifDropdown.classList.contains('hidden')) {
            markVisibleNotificationsAsRead();
        }
    });

    markAllReadBtn.addEventListener('click', () => {
         markVisibleNotificationsAsRead();
         showToast("Notificaciones marcadas como leídas.");
    });

    async function markVisibleNotificationsAsRead() {
        if (!currentUserId) return;
        const notificationItems = document.querySelectorAll('#notification-list .notification-item');
        const batch = writeBatch(db);
        let updatesMade = 0;

        notificationItems.forEach(item => {
            const notifId = item.dataset.id;
            if (notifId && item.classList.contains('bg-emerald-50')) {
                const notifRef = doc(db, `artifacts/${appId}/public/data/notifications`, notifId);
                batch.update(notifRef, {
                    readBy: [...(appState.notifications.find(n => n.id === notifId)?.readBy || []), currentUserId]
                });
                updatesMade++;
            }
        });

        if (updatesMade > 0) {
            try {
                await batch.commit();
                console.log("Notificaciones marcadas como leídas.");
            } catch (error) {
                console.error("Error marcando notificaciones como leídas:", error);
            }
        }
    }

    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.remove('opacity-0');
        setTimeout(() => {
            toast.classList.add('opacity-0');
        }, 3000);
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        const originalBtnHTML = saveSettingsBtn.innerHTML;

        saveSettingsBtn.addEventListener('click', async () => {
            if (!currentUserProfile) {
                showToast("Error: No se ha encontrado el perfil de usuario.");
                return;
            }

            saveSettingsBtn.disabled = true;
            saveSettingsBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...`;

            try {
                // 1. Subir la foto de perfil si se seleccionó una nueva
                if (selectedAvatarFile) {
                    showToast("Subiendo nueva foto...");
                    const storageRef = ref(storage, `avatars/${currentUserId}/${selectedAvatarFile.name}`);
                    const snapshot = await uploadBytes(storageRef, selectedAvatarFile);
                    const downloadURL = await getDownloadURL(snapshot.ref);

                    // Añadir la URL del avatar al objeto de actualizaciones
                    const userProfileRef = doc(db, `artifacts/${appId}/public/data/team`, currentUserId);
                    await updateDoc(userProfileRef, { avatar: downloadURL });

                    // Actualizar UI y estado local
                    currentUserProfile.avatar = downloadURL;
                    document.getElementById('header-user-avatar').src = downloadURL;
                    settingsUserAvatar.src = downloadURL;
                    selectedAvatarFile = null; // Limpiar después de subir

                    createNotification(`actualizó su foto de perfil.`, 'fa-camera', 'text-slate-500');
                    showToast("Foto de perfil actualizada.");
                }

                // 2. Actualizar nombre y puesto
                const newName = document.getElementById('profile-name').value;
                const newRole = document.getElementById('profile-role').value;
                const updates = {};
                if (newName !== currentUserProfile.name) updates.name = newName;
                if (newRole !== currentUserProfile.role) updates.role = newRole;

                if (Object.keys(updates).length > 0) {
                    const userProfileRef = doc(db, `artifacts/${appId}/public/data/team`, currentUserId);
                    await updateDoc(userProfileRef, updates);

                    if (updates.name) {
                        currentUserProfile.name = updates.name;
                        document.getElementById('header-user-name').textContent = updates.name;
                    }
                    if (updates.role) {
                        currentUserProfile.role = updates.role;
                        document.getElementById('header-user-role').textContent = updates.role;
                    }
                    showToast("Información del perfil actualizada.");
                } else if (!selectedAvatarFile) {
                    showToast("No hay cambios para guardar.");
                }

            } catch (error) {
                console.error("Error al guardar los cambios:", error);
                showToast("Error: " + error.message);
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.innerHTML = originalBtnHTML;
            }
        });
    }

}); // Fin de DOMContentLoaded